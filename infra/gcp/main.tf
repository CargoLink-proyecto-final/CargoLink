###############################################################################
# CargoLink — despliegue en Google Cloud (Cloud Run + Cloud SQL)
#
# Arquitectura:
#   - Artifact Registry  → registro de imágenes Docker (Cloud Run no puede
#     traer imágenes de GHCR directamente; se mirrorean acá).
#   - Cloud SQL Postgres → base de datos administrada.
#   - Cloud Run (backend)  → NestJS. Conecta a Cloud SQL por socket unix.
#   - Cloud Run (frontend) → Next.js standalone (se despliega en fase 2).
#   - Secret Manager     → DATABASE_URL, JWT_SECRET, (SMTP_PASSWORD opcional).
#
# Ver README.md para el flujo de deploy en 2 fases y la config manual previa.
###############################################################################

locals {
  # APIs de GCP que hay que habilitar en el proyecto.
  apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]

  # El frontend solo se despliega una vez que se le pasó su imagen (fase 2).
  frontend_deployed = var.frontend_image != ""
  smtp_enabled      = var.smtp_password != ""

  # URL pública del frontend. En fase 1 (sin frontend) cae al fallback.
  # try() evita el error de índice cuando frontend tiene count = 0.
  frontend_url = try(google_cloud_run_v2_service.frontend[0].uri, var.cors_origin_fallback)

  # Connection string de Prisma vía el socket unix de Cloud SQL.
  # Cloud Run monta el proxy en /cloudsql/<connection_name>.
  database_url = "postgresql://${var.db_user}:${random_password.db.result}@localhost/${var.db_name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}&schema=public"
}

# ──────────────────────────── APIs ────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  service = each.value
  # No deshabilitar la API al destruir: otros recursos del proyecto podrían usarla.
  disable_on_destroy = false
}

# ──────────────────────────── Artifact Registry ────────────────────────────
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "cargolink"
  description   = "Imágenes Docker de CargoLink (backend + frontend)"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# ──────────────────────────── Secretos generados ────────────────────────────
# special = false → password apto para usar dentro de la URL sin URL-encoding.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "random_password" "jwt" {
  length           = 64
  special          = true
  override_special = "!@#%^*-_=+"
}

# ──────────────────────────── Cloud SQL ────────────────────────────
resource "google_sql_database_instance" "main" {
  name                = "cargolink-db"
  database_version    = "POSTGRES_15"
  region              = var.region
  deletion_protection = var.db_deletion_protection

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL" # 'REGIONAL' (HA) duplica el costo; ZONAL alcanza para este proyecto.
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled    = true
      start_time = "06:00" # UTC ≈ 03:00 Argentina
    }

    ip_configuration {
      # IP pública pero SIN redes autorizadas: el único acceso es vía el
      # conector de Cloud SQL desde Cloud Run (autenticado por IAM).
      ipv4_enabled = true
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "main" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "main" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
}

# ──────────────────────────── Secret Manager ────────────────────────────
resource "google_secret_manager_secret" "database_url" {
  secret_id = "cargolink-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = local.database_url
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "cargolink-jwt-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt.result
}

resource "google_secret_manager_secret" "smtp_password" {
  count     = local.smtp_enabled ? 1 : 0
  secret_id = "cargolink-smtp-password"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "smtp_password" {
  count       = local.smtp_enabled ? 1 : 0
  secret      = google_secret_manager_secret.smtp_password[0].id
  secret_data = var.smtp_password
}

# ──────────────────────────── Service Account de runtime ────────────────────────────
resource "google_service_account" "run" {
  account_id   = "cargolink-run"
  display_name = "CargoLink Cloud Run runtime"
}

# Permite al backend conectarse a Cloud SQL.
resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# Acceso a cada secret (a nivel secret, no a nivel proyecto → mínimo privilegio).
resource "google_secret_manager_secret_iam_member" "database_url" {
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "jwt_secret" {
  secret_id = google_secret_manager_secret.jwt_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "smtp_password" {
  count     = local.smtp_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.smtp_password[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# ──────────────────────────── Cloud Run: backend ────────────────────────────
resource "google_cloud_run_v2_service" "backend" {
  name     = "cargolink-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.run.email
    timeout         = "3600s" # Largo para sostener conexiones WebSocket (Socket.IO).

    scaling {
      min_instance_count = var.backend_min_instances
      max_instance_count = var.backend_max_instances
    }

    # Monta el proxy de Cloud SQL en /cloudsql/<connection_name>.
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = var.backend_image

      # Cloud Run inyecta PORT=8080; el backend hace app.listen(process.env.PORT).
      ports {
        container_port = 8080
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "JWT_EXPIRATION"
        value = var.jwt_expiration
      }

      # CORS_ORIGIN y FRONTEND_URL apuntan al frontend una vez desplegado (fase 2).
      env {
        name  = "CORS_ORIGIN"
        value = local.frontend_url
      }
      env {
        name  = "FRONTEND_URL"
        value = local.frontend_url
      }

      env {
        name  = "SMTP_HOST"
        value = var.smtp_host
      }
      env {
        name  = "SMTP_PORT"
        value = var.smtp_port
      }
      env {
        name  = "SMTP_SECURE"
        value = var.smtp_secure
      }
      env {
        name  = "SMTP_USER"
        value = var.smtp_user
      }
      env {
        name  = "SMTP_FROM"
        value = var.smtp_from
      }

      dynamic "env" {
        for_each = local.smtp_enabled ? [1] : []
        content {
          name = "SMTP_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.smtp_password[0].secret_id
              version = "latest"
            }
          }
        }
      }

      # Da margen para que corran las migraciones Prisma en el arranque
      # (docker-entrypoint.sh: prisma migrate deploy + seed) antes de servir.
      startup_probe {
        tcp_socket {
          port = 8080
        }
        period_seconds    = 10
        timeout_seconds   = 5
        failure_threshold = 30 # hasta ~300s de margen de arranque
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.jwt_secret,
    google_secret_manager_secret_iam_member.database_url,
    google_secret_manager_secret_iam_member.jwt_secret,
    google_project_iam_member.sql_client,
    google_sql_database.main,
    google_sql_user.main,
  ]
}

# Backend público (la API la consume el browser/mobile).
resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  name     = google_cloud_run_v2_service.backend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ──────────────────────────── Cloud Run: frontend (fase 2) ────────────────────────────
resource "google_cloud_run_v2_service" "frontend" {
  count = local.frontend_deployed ? 1 : 0

  name     = "cargolink-frontend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = var.frontend_max_instances
    }

    containers {
      image = var.frontend_image

      # Next standalone (server.js) escucha en process.env.PORT → 8080.
      ports {
        container_port = 8080
      }

      # server.js de Next standalone bindea a process.env.HOSTNAME; en Cloud Run
      # debe ser 0.0.0.0 o no acepta tráfico externo (gotcha conocido).
      env {
        name  = "HOSTNAME"
        value = "0.0.0.0"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  count = local.frontend_deployed ? 1 : 0

  name     = google_cloud_run_v2_service.frontend[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
