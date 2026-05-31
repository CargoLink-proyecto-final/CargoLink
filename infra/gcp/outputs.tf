output "artifact_registry_repo" {
  description = "Ruta base del repo de Artifact Registry. Prefijá tus imágenes con esto."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "backend_url" {
  description = "URL pública del backend. El frontend se buildea con <backend_url>/api en NEXT_PUBLIC_API_URL."
  value       = google_cloud_run_v2_service.backend.uri
}

output "backend_api_url" {
  description = "URL de la API (lo que va en NEXT_PUBLIC_API_URL al buildear el frontend)."
  value       = "${google_cloud_run_v2_service.backend.uri}/api"
}

output "frontend_url" {
  description = "URL pública del frontend (vacío hasta la fase 2)."
  value       = try(google_cloud_run_v2_service.frontend[0].uri, "(frontend no desplegado todavía — fase 1)")
}

output "db_connection_name" {
  description = "Connection name de Cloud SQL (project:region:instance)."
  value       = google_sql_database_instance.main.connection_name
}

output "db_instance_name" {
  description = "Nombre de la instancia Cloud SQL (para gcloud sql / backups)."
  value       = google_sql_database_instance.main.name
}

# ──────────────────────────── Dominios custom (Load Balancer) ────────────────────────────
output "lb_ip" {
  description = "IP anycast del Load Balancer. Creá un registro A en el DNS (donweb) apuntando a esta IP. Vacío si no hay dominios configurados."
  value       = try(google_compute_global_address.lb[0].address, "(LB no creado — sin dominios)")
}

output "lb_cert_name" {
  description = "Nombre del certificado SSL managed. El estado (PROVISIONING/ACTIVE) no lo exporta Terraform; chequealo con: gcloud compute ssl-certificates describe <name> --global --format='value(managed.status)'"
  value       = try(google_compute_managed_ssl_certificate.lb[0].name, "(sin cert)")
}
