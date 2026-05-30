variable "project_id" {
  description = "ID del proyecto GCP donde se despliega todo (ej. cargolink-prod-123456)."
  type        = string
}

variable "region" {
  description = "Región GCP. southamerica-east1 (São Paulo) es la más cercana a Argentina."
  type        = string
  default     = "southamerica-east1"
}

# ──────────────────────────── Imágenes ────────────────────────────
# Rutas completas a las imágenes en Artifact Registry, con tag o digest.
# Formato: <region>-docker.pkg.dev/<project>/cargolink/<imagen>:<tag>
# El frontend se deja vacío en la FASE 1 (todavía no se buildeó con la URL del
# backend) y se setea en la FASE 2. Ver README §"Flujo de deploy en 2 fases".

variable "backend_image" {
  description = "Imagen del backend en Artifact Registry (requerida para desplegar el backend)."
  type        = string
}

variable "frontend_image" {
  description = "Imagen del frontend en Artifact Registry. Vacío = no se despliega el frontend todavía (fase 1)."
  type        = string
  default     = ""
}

# ──────────────────────────── Base de datos ────────────────────────────
variable "db_tier" {
  description = "Tier de Cloud SQL. db-f1-micro es el más barato (shared-core); db-g1-small si necesitás más."
  type        = string
  default     = "db-f1-micro"
}

variable "db_name" {
  description = "Nombre de la base de datos."
  type        = string
  default     = "cargolink"
}

variable "db_user" {
  description = "Usuario de la base de datos que usa el backend."
  type        = string
  default     = "cargolink"
}

variable "db_disk_size" {
  description = "Tamaño del disco de Cloud SQL en GB."
  type        = number
  default     = 10
}

variable "db_deletion_protection" {
  description = "Protección contra borrado de la instancia Cloud SQL. false facilita 'terraform destroy' (útil para un proyecto académico)."
  type        = bool
  default     = false
}

# ──────────────────────────── Backend runtime ────────────────────────────
variable "jwt_expiration" {
  description = "Expiración del JWT (lo lee el backend como JWT_EXPIRATION)."
  type        = string
  default     = "7d"
}

variable "backend_min_instances" {
  description = "Instancias mínimas del backend. 1 mantiene una instancia caliente: evita re-correr seed/migraciones en cada cold start y mantiene vivas las conexiones WebSocket."
  type        = number
  default     = 1
}

variable "backend_max_instances" {
  description = "Instancias máximas del backend. DEBE quedar en 1 mientras Socket.IO use el adapter en memoria (sin Redis no hay estado compartido entre instancias). Ver README §'WebSockets'."
  type        = number
  default     = 1
}

variable "frontend_max_instances" {
  description = "Instancias máximas del frontend (puede escalar libremente, no tiene estado)."
  type        = number
  default     = 3
}

variable "cors_origin_fallback" {
  description = "Valor de CORS_ORIGIN/FRONTEND_URL cuando el frontend todavía no está desplegado (fase 1)."
  type        = string
  default     = "http://localhost:3000"
}

# ──────────────────────────── SMTP (opcional) ────────────────────────────
# Dejá SMTP_USER/PASSWORD vacíos para que el backend caiga al fallback Ethereal
# (preview de dev, no envía mails reales). Para envío real, completá todo.
variable "smtp_host" {
  type    = string
  default = ""
}

variable "smtp_port" {
  type    = string
  default = "587"
}

variable "smtp_secure" {
  type    = string
  default = "false"
}

variable "smtp_user" {
  type    = string
  default = ""
}

variable "smtp_password" {
  description = "Password SMTP. Si está vacío no se crea el secret ni se inyecta. Si lo seteás, se guarda en Secret Manager."
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_from" {
  type    = string
  default = ""
}
