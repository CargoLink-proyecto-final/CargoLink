# Comandos GCP — revisar los containers de CargoLink

Referencia rápida para inspeccionar el deploy de CargoLink en Google Cloud (Cloud Run + Cloud SQL).

## Contexto del proyecto

| Dato | Valor |
|---|---|
| **Project** | `project-9dc11c1e-5a14-4076-a74` |
| **Region** | `southamerica-east1` |
| **Servicios Cloud Run (prod)** | `cargolink-backend`, `cargolink-frontend` |
| **Servicios Cloud Run (dev)** | `cargolink-dev-backend`, `cargolink-dev-frontend` |
| **Cloud SQL (prod / dev)** | `cargolink-db` / `cargolink-dev-db` |

> El entorno define el prefijo del nombre: **prod** no lleva prefijo, **dev** usa `dev-`
> (definido por `local.infix` en `main.tf`).

Abrí **Cloud Shell** en la consola de GCP (ícono `>_` arriba a la derecha) y usá estos comandos.

---

## 1. Apuntar gcloud al proyecto/región

```bash
gcloud config set project project-9dc11c1e-5a14-4076-a74
gcloud config set run/region southamerica-east1
```

## 2. Listar todos los servicios Cloud Run (los "containers")

```bash
gcloud run services list
```

## 3. Inspeccionar un servicio — imagen, env vars, recursos, estado

```bash
gcloud run services describe cargolink-backend --region southamerica-east1
```

Cambiá por `cargolink-frontend` (o los nombres `cargolink-dev-*`) según necesites.
Agregá `--format=yaml` para el spec completo, o sacá solo la imagen corriendo:

```bash
gcloud run services describe cargolink-backend --region southamerica-east1 \
  --format='value(spec.template.spec.containers[0].image)'
```

## 4. Revisar revisiones (cada deploy = una revisión/container nuevo)

```bash
gcloud run revisions list --service cargolink-backend --region southamerica-east1
```

## 5. Leer los logs del container

```bash
gcloud run services logs read cargolink-backend --region southamerica-east1 --limit 100
```

Tail en vivo:

```bash
gcloud run services logs tail cargolink-backend --region southamerica-east1
```

## 6. Revisar las imágenes en Artifact Registry (lo disponible para deployar)

```bash
# repo prod
gcloud artifacts docker images list \
  southamerica-east1-docker.pkg.dev/project-9dc11c1e-5a14-4076-a74/cargolink

# repo dev
gcloud artifacts docker images list \
  southamerica-east1-docker.pkg.dev/project-9dc11c1e-5a14-4076-a74/cargolink-dev
```

## Bonus — la instancia Cloud SQL (container de la DB)

```bash
gcloud sql instances list
gcloud sql instances describe cargolink-db          # prod (dev: cargolink-dev-db)
```

---

## Alternativa por consola web (sin comandos)

**Console → Cloud Run** muestra ambos servicios; cada servicio tiene pestañas
**Revisions / Logs / YAML** con la misma info que los comandos 3–5.
