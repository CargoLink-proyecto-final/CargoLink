---
description: Porta un commit del repo upstream Pronosticos a Plataforma adaptándolo a su estructura
---

El usuario quiere portar un commit del repo upstream `RindePlus/Pronosticos` a este repo. Argumento esperado: `<sha>` del commit upstream (ej. `/upstream-port d70474b`).

Si no recibís sha como argumento, pedíselo y terminá. No inventes uno. Atajo útil para sugerirle si quiere portar el próximo cronológico pendiente: `/upstream-port $(bash scripts/upstream/pending.sh --next)` — `pending.sh --next` resuelve al sha del commit upstream más viejo todavía no portado.

Seguí este flujo paso a paso. **No abrevies**.

## Modos de trabajo

El slash command soporta dos modos según la rama desde donde lo invocás:

- **Single** (`/upstream-port` desde `develop`): crea una rama feature nueva por cada port; cada port se cierra con su propio PR. Bueno para ports aislados o cambios de schema delicados (rollback granular).
- **Batch** (`/upstream-port` desde `feat/upstream-batch-*`): acumula varios ports en la **misma rama**, un solo PR al final. Alineado con el patrón histórico del repo (`feat(batch5): migrate upstream #390-394`). Bueno cuando vas a portar varios commits seguidos y la review en lote es razonable.

El modo se detecta en el paso 1 según la rama actual. No hace falta flag.

## 1. Pre-condición de rama y modo

```bash
git rev-parse --abbrev-ref HEAD
```

Determiná el modo según la rama actual:

- **`develop`** → modo **single** (o primer port de un batch nuevo, según preferencia). Vas a crear rama nueva en el paso 5.
- **`feat/upstream-batch-*`** → modo **batch en progreso**. **Continuás** en esa rama; el paso 5 es no-op.
- **`feat/port-upstream-*`** (legacy del modo single antes de adoptar batch) → tratalo igual que batch: continuás en esa rama, paso 5 no-op. Sugerile al user renombrarla a `feat/upstream-batch-<N>` para semántica clara.
- **Cualquier otra rama** → parate. Sugerí `git switch develop && git pull --ff-only origin develop` o que retome una rama batch existente. Terminá.

Working tree: si hay cambios sin commitear, parate. Pedí stash o commit primero.

## 2. Asegurar upstream local actualizado

```bash
git -C "${UPSTREAM_REPO_PATH:-../Pronosticos}" fetch origin
```

Si el directorio del upstream no existe, guiá al usuario a clonarlo (ver `scripts/upstream/README.md`).

## 3. Inspeccionar el commit upstream

```bash
bash scripts/upstream/inspect.sh <sha>
```

Si querés ver el diff completo:

```bash
bash scripts/upstream/inspect.sh <sha> --diff
```

Leé la salida y armate un mapa mental:
- **Tipo de cambio** (feat/fix/refactor/chore/docs/test).
- **Dominio** (qué módulo de Plataforma toca: gestion-licencias, lotes, resultados, etc.).
- **Categorías de archivos**: frontend (componentes/páginas/hooks), backend (handler/modelo/schema), DB (alembic), tests, infra.
- **Dependencias**: ¿este commit asume cambios previos no portados? Si sí, alertá al usuario y preguntá cómo proceder (portar antes los previos, o saltar este).

## 4. Decidir si aplica

Antes de tocar nada, evaluá:
- ¿La feature/fix tiene sentido en Plataforma? Puede haber divergencia intencional.
- ¿Toca código reescrito en Plataforma (backend monolítico vs upstream modular, schema normalizado vs no)?
- Si toca DB, ¿la migración upstream es adaptable al `Lote+Campania+Ambiente` de Plataforma?

Si alguna respuesta es "no" claro: detené el flujo y consultá al usuario antes de seguir. No portees ciegamente.

## 5. Crear o reusar feature branch (depende del modo del paso 1)

**Si estás en `develop`** (modo single o primer port de batch nuevo):

```bash
# Para batch nuevo (preferido si vas a portar varios commits seguidos):
git switch -c feat/upstream-batch-<N>

# O para single-port:
git switch -c feat/port-upstream-<sha-corto>-<slug>
```

Para `<N>` del batch nuevo: buscá en el git log el último `feat(batchM): ...` y usá `M+1`. Ejemplo:
```bash
git log --all --oneline | grep -oE 'batch[0-9]+' | sort -V | tail -1
```

Si el cambio del primer port es claramente fix/chore/refactor en vez de feat, usá ese type para la rama: `fix/upstream-batch-<N>`, `chore/upstream-batch-<N>`, etc. — pero en batch normal, `feat/` está bien aunque algunos ports individuales sean fix.

**Si ya estás en `feat/upstream-batch-*` o `feat/port-upstream-*`** (modo batch en progreso): **NO crees rama nueva**. Saltá este paso y continuá al 6. Todos los commits siguientes se acumulan en la rama actual hasta que el user decida cerrar el batch.

## 6. Mapear archivos upstream → Plataforma

Para cada archivo del commit upstream, decidí dónde va en Plataforma. Mostrale al usuario una tabla de mapeo en formato:

| Archivo upstream | Archivo Plataforma | Tipo de adaptación |
|---|---|---|
| `frontend/src/components/X.tsx` | mismo path | copy + ajustar imports/types |
| `backend/routers/lote.py` | `backend/main.py` | reimplementar handler inline |
| `alembic/versions/xxx.py` | `alembic/versions/<nuevo>.py` | migración nueva adaptada al 3-table split |

Pedí confirmación antes de aplicar. No saltees archivos sin avisar.

## 7. Aplicar cambios

Para cada archivo del mapeo, traé el diff upstream con:

```bash
git -C "${UPSTREAM_REPO_PATH:-../Pronosticos}" show <sha> -- <path>
```

Estrategia según tipo:
- **Frontend con mismo path**: aplicá el diff con `Edit`, ajustando imports/tipos al schema de Plataforma.
- **Backend que diverge fuerte**: re-implementá en `backend/main.py` desde la intención, no copies literal. Las queries deben usar `Lote + Campania + Ambiente` (no `Lote` monolítico).
- **Alembic**: creá una nueva migración con docstring `Adapted from upstream <sha>`. La operación SQL probablemente será distinta.

## 8. Validar

Antes de commitear, corré lo que aplique:

```bash
# Frontend (si tocaste frontend/)
cd frontend && npm run build

# Backend (si tocaste backend/)
cd backend && pytest

# Alembic (si creaste migración)
alembic upgrade head  # contra DB local
```

**Smoke test manual**: si tocaste un endpoint o pantalla, levantá el stack docker y probá la feature manualmente. Documentá qué probaste.

Si algo falla, **arreglalo antes de commitear**. No bypassees.

## 9. Commit

Formato obligatorio (ojo: pasá el mensaje a `-m` como **string literal con dobles comillas y newlines reales**, no como `$(cat <<EOF)` — el hook `pre-commit-validate.sh` no expande heredocs):

```
<type>(<scope>): port upstream <sha-corto> - <descripción imperativa>

Adaptaciones aplicadas:
  - <ej: query reescrita para schema 3-tabla>
  - <ej: handler movido a main.py>
  - <ej: migración Alembic equivalente creada en alembic/versions/xxx.py>

Diferencias intencionales con upstream:
  - <ej: omitido X porque Plataforma no tiene Y>

Upstream ref: <sha-completo>
```

`<type>` debe coincidir con el de la rama.
`<scope>` en kebab-case, derivado del módulo principal tocado.
`<descripción>` en inglés, minúsculas, imperativo, sin punto final, ≤72 chars en la primera línea.

```bash
git commit -m "feat(scope): port upstream abc1234 - short description

Adaptaciones aplicadas:
  - ...

Upstream ref: abc1234567890..."
```

Si el hook bloquea, leé el error, corregí y reintentá. **No** uses `--no-verify`.

## 10. Actualizar `UPSTREAM.md`

Editá la tabla "Último portado":
- `Último commit upstream cubierto`: el sha que acabás de portar (entre backticks)
- `Subject del commit upstream`: copialo del inspect
- `Fecha del commit upstream`: del inspect (formato YYYY-MM-DD)
- `Fecha del portado a Plataforma`: la fecha de hoy
- `Notas`: limpiar las del puntero anterior (ya no aplican); opcionalmente agregar contexto si fue un portado parcial.

Hacé un segundo commit:

```bash
git add UPSTREAM.md
git commit -m "chore(upstream): bump pointer to <sha-corto>"
```

Mantener separado el commit de portado y el bump del puntero hace el historial más legible.

## 11. Ofrecer próximo paso

Mostrale al user un resumen tipo:
> Port `<sha>` completado. 2 commits agregados a `<rama>` (port + bump UPSTREAM.md).
> La rama tiene N commits totales (batch en progreso).

Y preguntale con `AskUserQuestion` qué hacer:

- **Continuar al próximo upstream** (Recomendado en modo batch): invocar `/upstream-port $(bash scripts/upstream/pending.sh --next)` para acumular el siguiente port. La rama actual se reusa.
- **Cerrar el batch con /pr** (Recomendado en modo single, o cuando el user juzga que el batch ya cubre suficiente): invocar `/pr` para abrir PR contra `develop` con todo lo acumulado.
- **Pausar**: terminar el flujo. El user retoma cuando quiera invocando `/upstream-port` desde la misma rama.

No hagas automático ninguna opción — dejá que el user elija.

---

## Si algo sale mal

- Hook `pre-commit-validate.sh` bloquea por mensaje malformado → leé el error, corregí. Si fue por heredoc no expandido, reintentá con string literal.
- Tests fallan → arreglá, no commitees.
- El sha upstream no existe localmente → `git -C ../Pronosticos fetch origin`.
- Conflicto inesperado entre upstream y Plataforma (schema, deps) → parate y consultá.
- El commit upstream incluye refactor masivo → considerá dividir en varios commits/PRs en Plataforma.
