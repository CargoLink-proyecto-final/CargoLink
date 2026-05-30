terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0, < 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5"
    }
  }

  # Opcional pero recomendado: mover el state a un bucket GCS para no tenerlo
  # solo en tu disco. Descomentá y creá el bucket primero (ver README §"State remoto").
  # backend "gcs" {
  #   bucket = "cargolink-tfstate-<tu-sufijo-unico>"
  #   prefix = "gcp/cloud-run"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
