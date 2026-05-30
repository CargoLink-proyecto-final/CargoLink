# Arquitectura de despliegue — GCP

Diagrama del despliegue de CargoLink en Google Cloud: dos entornos (dev/prod) con deploy continuo desde GitHub Actions, autenticación keyless vía Workload Identity Federation, e infraestructura como código con Terraform.

> Detalle operativo en [`ci-cd.md`](./ci-cd.md) (pipeline) y [`../infra/gcp/README.md`](../infra/gcp/README.md) (Terraform + setup).

```mermaid
flowchart TB
  Dev(["👩‍💻 Developer"]) -->|"merge PR"| GH

  subgraph GH["GitHub"]
    direction LR
    DEVB["branch: develop"]
    MAINB["branch: main"]
    GA["GitHub Actions<br/>deploy-gcp.yml"]
    DEVB --> GA
    MAINB --> GA
  end

  GA -->|"OIDC token<br/>(keyless)"| WIF

  subgraph GCP["Google Cloud · project cargo-link-2026 · southamerica-east1"]
    direction TB
    WIF["🔑 Workload Identity Federation<br/>impersonates github-deployer SA"]
    TF["📦 Terraform (infra/gcp)<br/>provisions infra · owns config<br/>ignore_changes on image"]

    subgraph DEVENV["dev environment  ⟵ develop"]
      direction TB
      ARDEV["Artifact Registry<br/>cargolink-dev"]
      RUNDEVF["Cloud Run<br/>cargolink-dev-frontend"]
      RUNDEVB["Cloud Run<br/>cargolink-dev-backend<br/>min 0 · scales to zero"]
      SECDEV["Secret Manager<br/>cargolink-dev-*"]
      SQLDEV[("Cloud SQL<br/>cargolink-dev-db")]
      RUNDEVF -->|"/api"| RUNDEVB
      RUNDEVB --> SECDEV
      RUNDEVB -->|"unix socket"| SQLDEV
    end

    subgraph PRODENV["prod environment  ⟵ main"]
      direction TB
      ARPROD["Artifact Registry<br/>cargolink"]
      RUNPRODF["Cloud Run<br/>cargolink-frontend"]
      RUNPRODB["Cloud Run<br/>cargolink-backend<br/>min 1 · always warm"]
      SECPROD["Secret Manager<br/>cargolink-*"]
      SQLPROD[("Cloud SQL<br/>cargolink-db")]
      RUNPRODF -->|"/api"| RUNPRODB
      RUNPRODB --> SECPROD
      RUNPRODB -->|"unix socket"| SQLPROD
    end

    WIF --> DEVENV
    WIF --> PRODENV
    TF -.->|"provisions"| DEVENV
    TF -.->|"provisions"| PRODENV
  end

  GA ==>|"push develop:<br/>build → push → gcloud run deploy"| DEVENV
  GA ==>|"push main:<br/>build → push → gcloud run deploy"| PRODENV

  Users(["🌐 Users / browser"]) -->|"HTTPS *.run.app"| RUNPRODF
  Users -->|"HTTPS *.run.app"| RUNDEVF

  classDef env fill:#e8f0fe,stroke:#4285f4,stroke-width:1px;
  classDef store fill:#fff3e0,stroke:#fb8c00;
  class DEVENV,PRODENV env;
  class SQLDEV,SQLPROD,SECDEV,SECPROD,ARDEV,ARPROD store;
```

## Cómo leerlo

- **Developer → GitHub**: cada merge a `develop` o `main` dispara el workflow `deploy-gcp.yml`.
- **Autenticación keyless**: GitHub Actions obtiene un token OIDC; Workload Identity Federation lo valida (restringido al repo) y deja impersonar la service account `github-deployer`. No hay keys guardadas en GitHub.
- **Dos entornos** en el mismo proyecto `cargo-link-2026`, totalmente separados (Cloud Run, Cloud SQL, Secret Manager y Artifact Registry propios):
  - `develop` → **dev** (`cargolink-dev-*`), backend escala a cero.
  - `main` → **prod** (`cargolink-*`), backend siempre caliente.
- **CI vs Terraform**: el workflow builda la imagen y la deploya con `gcloud run deploy`; Terraform (en `infra/gcp/`) provisiona y es dueño del resto de la config. El `ignore_changes` sobre la imagen evita que se pisen.
- **Frontend → backend**: el frontend llama a la API en `/api`; `NEXT_PUBLIC_API_URL` se hornea en el build de CI resolviendo en vivo la URL del backend del entorno.
- **TLS**: automático en las URLs `*.run.app` de Cloud Run.
