# Decisión: deploy continuo al VPS con runner self-hosted

- **Fecha**: 2026-09-13
- **Estado**: aceptada
- **Reemplaza**: el deploy continuo a GCP Cloud Run (`.github/workflows/deploy-gcp.yml`, eliminado el 2026-09-14)

## Contexto

Prod y dev dejaron de correr en GCP (Cloud Run + Cloud SQL) y pasaron a un VPS propio (`ubuntu-tesis01`), desplegados a mano el 2026-09-13 con Docker Compose detrás de un Cloudflare Tunnel (detalle en [`deployment.md`](./deployment.md)). Hacía falta que el CI/CD dejara de deployar en GCP y deployara en el VPS.

Restricciones duras del VPS:

- **Sin conectividad entrante.** Solo hay acceso por RDP; no hay SSH expuesto ni control del router, así que no se pueden abrir puertos. Todo lo que funcione tiene que salir desde el VPS.
- **La org tiene deploy keys deshabilitadas.** Los clones hacen pull por HTTPS con un fine-grained PAT de solo lectura.
- **Org en plan GitHub Free con repo privado**, así que no hay Environments ni rulesets/branch protection. Los secrets y los runners no se pueden atar a una rama.
- **Recursos acotados**: 4 CPU y 7,3 GB de RAM compartidos entre prod, dev y el túnel. Un build completo tarda unos 7 minutos.

## Decisión

**Un runner self-hosted de GitHub Actions instalado en el mismo VPS**, que buildea las imágenes localmente con el `docker-compose.yml` del repo más un override versionado por entorno.

- Workflow: [`../.github/workflows/deploy-vps.yml`](../.github/workflows/deploy-vps.yml). Solo dispara en `push` a `develop` (dev) o `main` (prod).
- Lógica: [`../deploy/vps/deploy.sh`](../deploy/vps/deploy.sh). Hace fast-forward del clone, taggea `:previous`, buildea, toma backup (solo prod), levanta, corre el healthcheck y limpia.
- Overrides y compose del túnel versionados en [`../deploy/vps/`](../deploy/vps/), sin secretos. Los `.env` quedan locales en el VPS.

## Alternativas evaluadas

| Opción | Por qué no (por ahora) |
|---|---|
| **SSH por Cloudflare Tunnel + Access service token** | Obliga a exponer `sshd` a internet (detrás de Access) y a guardar un service token y una clave SSH en GitHub Secrets. Sin Environments, esos secrets quedan disponibles desde cualquier rama. Son más piezas sin ganar seguridad: una clave filtrada da una shell remota. |
| **Tailscale en el runner de GitHub** | Tiene los mismos problemas que la anterior (`sshd` + secret en GitHub con alcance a cualquier rama) y además depende de otra cuenta de terceros. |
| **Build en GitHub Actions → GHCR → pull en el VPS** | Le saca CPU al VPS y permite rollback por SHA, pero en Free el storage privado de GitHub Packages es chico y cada imagen pesa cientos de MB, así que habría que mantener una política de limpieza. También hay que reescribir los overrides para usar `image:`. Se puede sumar más adelante sobre este mismo runner si los builds locales empiezan a afectar a prod. |

## Consecuencias

**A favor**

- Solo usa conexión saliente y no hay secretos nuevos en GitHub. El runner usa el `~/.git-credentials` y el grupo `docker` que ya tenía el usuario `mfrias`.
- Un solo runner serializa los deploys, así que nunca hay dos builds en paralelo compitiendo por la RAM. El script además toma un `flock` para no cruzarse con un deploy manual.
- El mismo script funciona como plan B manual si el runner está caído.
- Los runners self-hosted no consumen minutos incluidos de Actions.

**En contra / riesgos aceptados**

- **Cualquiera con permiso de escritura en el repo puede ejecutar código en el VPS.** GitHub lee el workflow desde la rama pusheada, así que un workflow con `runs-on: [self-hosted, cargolink-vps]` en cualquier rama correría en el runner, con acceso a Docker (equivale a root) y a los `.env`. En Free no hay forma de limitar un runner a un workflow o una rama. Mitigación: mantener mínima la lista de colaboradores con escritura, no habilitar forks del repo privado y **nunca** usar el runner en `pull_request`. Si la org pasa a un plan Team, conviene mover el runner a un runner group restringido a `deploy-vps.yml`.
- El build corre en el mismo host que prod. Durante unos 7 minutos prod comparte CPU con el build; con el tráfico actual es aceptable.
- El corte en cada deploy es de segundos: lo que tarda en recrearse cada contenedor más las migraciones. No hay blue/green.
- El rollback de imagen no revierte migraciones (ver [`deployment.md`](./deployment.md) § Rollback).
- El PAT de los clones vence el **2027-09-13**. Si no se renueva, el `git fetch` del deploy falla.
- **Pendiente de verificar en Billing**: GitHub anunció un cargo por minuto para runners self-hosted en repos privados. Con este volumen sería marginal.

## GCP

El 2026-09-14, con prod y dev ya estables en el VPS, se apagó GCP:

- Se eliminaron los proyectos `project-9dc11c1e-5a14-4076-a74` (Cloud Run, Cloud SQL, load balancers, Artifact Registry, Secret Manager) y `cargo-link-2026` (el proyecto anterior, que ya tenía la facturación cortada).
- Antes de borrarlas se tomó un dump final de las bases de Cloud SQL de prod y dev. Queda fuera del repo, en manos del mantenedor.
- Se borraron los DNS `api.cargolink.com.ar` y `api.dev.cargolink.com.ar`. La API ahora vive en `https://plataforma.cargolink.com.ar/api` (prod) y `https://dev.cargolink.com.ar/api` (dev), por la misma ruta del túnel que la web.
- Se quitaron del repo `deploy-gcp.yml`, `infra/gcp/` (Terraform) y `docs/arquitectura-gcp.md`. Para consultarlos: `git show d692cca:docs/arquitectura-gcp.md` o `git checkout d692cca -- infra/gcp`.
