# Configuración de SonarCloud (SonarQube Cloud)

Pasos para dejar andando el análisis estático y el quality gate del TP de Calidad de Software. El pipeline ya está escrito ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) + [`sonar-project.properties`](../../sonar-project.properties)); lo que sigue es la parte que se hace a mano en SonarCloud y GitHub.

**Alcance del análisis:** solo el módulo de viajes (`trips`):

- `backend/src/trips/`
- `backend/src/common/routing.ts` (integración con OSRM)
- `frontend/src/app/trips/`
- `frontend/src/components/trips/`

## Datos que tienen que coincidir

| Dato | Valor esperado | Dónde está |
|---|---|---|
| Organización (clave) | `cargolink-proyecto-final` | `sonar.organization` en `sonar-project.properties` |
| Proyecto (clave) | `CargoLink-proyecto-final_CargoLink` | `sonar.projectKey` en `sonar-project.properties` |
| Repo de GitHub | `CargoLink-proyecto-final/CargoLink` | — |
| Secret en GitHub | `SONAR_TOKEN` | Settings → Secrets and variables → Actions |

Si SonarCloud genera una clave de proyecto distinta, hay que actualizar `sonar.projectKey`.

---

## Paso 1 — Darle acceso a SonarCloud sobre el repo de la organización

> Lo hace un **owner** de la organización de GitHub.

1. GitHub → organización **CargoLink-proyecto-final** → **Settings** → **GitHub Apps**.
2. Buscar **SonarQube Cloud** → **Configure**.
3. En *Repository access*, elegir **All repositories** o agregar `CargoLink` en *Only select repositories*.
4. **Save**.

Si la app no aparece instalada, se instala desde SonarCloud al crear/importar la organización (Paso 2).

## Paso 2 — Organización en SonarCloud

La organización `cargolink-proyecto-final` ya existe (vinculada a la de GitHub).

1. Entrar a <https://sonarcloud.io> con la cuenta de GitHub.
2. Arriba a la izquierda, seleccionar **CargoLink-proyecto-final**.
3. Revisar **Administración → Facturación / Plan**:
   - Si dice **Plan del equipo** como *prueba*, anotar la **fecha de vencimiento**. Tiene que cubrir hasta el **26/10/2026**.
   - Si el plan está pendiente de pago, pasarla al **plan gratuito** y confirmar que admite el repo privado (límite de líneas de código del plan free).
4. En **Miembros**, agregar a los 3 integrantes. Al menos uno con permiso de **Administrar**.

## Paso 3 — Importar el proyecto

1. Clic en **+** (arriba a la derecha) → **Analizar nuevo proyecto**.
2. En el desplegable **Organización**, elegir **CargoLink-proyecto-final**.
   - ⚠️ **No** usar la organización personal (`vicent301`): ahí aparece otro repo `CargoLink` (`vicent301/CargoLink`, viejo) que **no** es el del proyecto.
   - Si la organización aparece en gris y no se puede elegir: revisar el Paso 1 (acceso de la app), el Paso 2 (plan/facturación) o que tu usuario sea admin de la organización en SonarCloud.
3. Marcar el repo **CargoLink** → **Configurar**.

## Paso 4 — Definición de código nuevo

Al crear el proyecto pregunta cómo definir el "código nuevo":

- Elegir **Rama de referencia** → `develop`.

Así el quality gate evalúa en cada PR solo lo que ese PR agrega respecto de `develop` (la "cobertura sobre código nuevo" que pide la consigna).

Se puede cambiar después en **Proyecto → Administración → Código nuevo**.

## Paso 5 — Método de análisis: GitHub Actions

1. En la pantalla **Método de análisis**, elegir **Con GitHub Actions**.
2. SonarCloud muestra:
   - **`SONAR_TOKEN`** → copiarlo (se usa en el Paso 6).
   - Un ejemplo de workflow y de `sonar-project.properties` → **ignorarlos**, ya están en el repo.
   - La **clave del proyecto** → verificar que sea `CargoLink-proyecto-final_CargoLink`.
3. Desactivar el análisis automático: **Proyecto → Administración → Método de análisis → apagar "Análisis automático"**.
   - Si queda prendido, el job de CI falla con un error del estilo *"You are running CI analysis while Automatic Analysis is enabled"*.

## Paso 6 — Cargar el token en GitHub

> Lo hace alguien con permisos de admin sobre el repo.

1. GitHub → repo **CargoLink** → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**:
   - Name: `SONAR_TOKEN`
   - Secret: el token del Paso 5.
3. **Add secret**.

Mientras el secret no exista, el job `SonarCloud` del CI no falla: emite un *warning* y se saltea el análisis.

## Paso 7 — Quality gate

La consigna exige que el gate **bloquee** ante:

- bugs críticos,
- duplicación mayor a 5 %,
- cobertura sobre código nuevo menor a 80 %.

### Opción A — Gate propio (requiere plan de equipo)

1. **Políticas → Puertas de calidad → Crear**. Nombre sugerido: `CargoLink TP Calidad`.
2. Agregar condiciones sobre **código nuevo**:

| Métrica | Operador | Valor |
|---|---|---|
| Cobertura | es menor que | 80 % |
| Líneas duplicadas (%) | es mayor que | 5 % |
| Calificación de fiabilidad | es peor que | A |
| Calificación de seguridad | es peor que | A |

3. Asignarlo al proyecto: **Proyecto → Administración → Puerta de calidad** → elegir `CargoLink TP Calidad`.

### Opción B — "Sonar way" (default, plan gratuito)

No hay que hacer nada. Exige sobre código nuevo: cobertura ≥ 80 %, duplicación ≤ 3 %, calificaciones A en fiabilidad, seguridad y mantenibilidad, y hotspots revisados. Es **más estricto** que la consigna, así que también la cumple.

### Cómo bloquea

`sonar.qualitygate.wait=true` (en `sonar-project.properties`) hace que el job `SonarCloud` espere el resultado del gate y **falle** si no pasa. Para que eso bloquee el merge:

1. GitHub → repo → **Settings → Branches** (o **Rules → Rulesets**) → regla para `develop`.
2. **Require status checks to pass** → agregar:
   - `Backend · lint, build, tests`
   - `Frontend · lint, tests, build`
   - `SonarCloud · análisis estático y quality gate`

Los checks aparecen en la lista recién después de la primera corrida del workflow.

## Paso 8 — Primera corrida (línea base)

1. Commit + push de la rama `chore/ci-tests-sonarcloud` y PR a `develop`.
2. En **Actions** del repo, verificar los 3 jobs.
3. Resultado esperado de la primera corrida:
   - **Backend:** verde.
   - **Frontend:** **rojo** por el test de "Calificar Viaje" (`frontend/src/app/trips/[id]/page.test.tsx`). Es un defecto real ya conocido y sirve como la "ejecución fallida que detectó un problema real" que pide la consigna.
   - **SonarCloud:** corre igual (está configurado con `if: !cancelled()`), publica análisis y cobertura.
4. En SonarCloud, el proyecto debería mostrar cobertura cercana a la línea base medida a mano el 2026-10-19:

| | Sentencias | Branches |
|---|---|---|
| Backend `trips` + `routing.ts` | 84,8 % | 82,6 % |
| Frontend `app/trips` | 82,6 % | 67,0 % |

5. Guardar capturas de esta primera corrida (Actions + dashboard de SonarCloud) para el informe: es el "antes" de la mejora medida.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| La organización aparece en gris al importar | App sin acceso al repo, plan sin pagar o usuario sin permisos | Pasos 1 y 2 |
| `Project not found` | `sonar.projectKey` u `sonar.organization` no coinciden | Corregir `sonar-project.properties` con la clave real del proyecto |
| `Automatic Analysis is enabled` | Quedó prendido el análisis automático | Paso 5.3 |
| Cobertura 0 % en SonarCloud | Rutas del `lcov` no resuelven | El workflow les antepone `backend/` y `frontend/`; revisar que los artefactos `coverage-backend` y `coverage-frontend` se hayan subido |
| `Not authorized` / `401` | Token mal copiado o vencido | Regenerar en SonarCloud (Mi cuenta → Seguridad) y reemplazar el secret |
| Warning "SONAR_TOKEN no configurado" | Falta el secret | Paso 6 |
| PRs desde forks sin análisis | GitHub no expone secrets a forks | Esperado; trabajar con ramas del propio repo |

## Checklist

- [ ] App de SonarQube Cloud con acceso al repo `CargoLink-proyecto-final/CargoLink`
- [ ] Plan de la organización verificado (vigente hasta el 26/10)
- [ ] Los 3 integrantes como miembros de la organización
- [ ] Proyecto importado desde la organización correcta
- [ ] Código nuevo = rama de referencia `develop`
- [ ] Método de análisis: GitHub Actions; análisis automático apagado
- [ ] Clave del proyecto verificada contra `sonar-project.properties`
- [ ] Secret `SONAR_TOKEN` cargado en GitHub
- [ ] Quality gate asignado (propio o Sonar way)
- [ ] Primera corrida ejecutada y capturas guardadas
- [ ] Status checks requeridos en `develop`
