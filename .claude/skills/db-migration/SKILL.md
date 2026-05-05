---
name: db-migration
description: Crear, modificar o rollbackear una migración de base de datos con Alembic en este repo. Usar cuando la tarea implique cambios de schema (ALTER TABLE, CREATE TABLE, DROP COLUMN), backfill de datos, seeds, o restore desde backup. Toca archivos bajo backend/alembic/versions/.
---

# Skill: Database migration

Guía para cambios de schema y datos en la DB de RindePlus usando Alembic. La DB es PostgreSQL 15; las migraciones corren dentro del container `dev_plataforma_backend` en dev y via el entrypoint del backend en prod.

## Regla dura — Backup antes de aplicar

**Antes de aplicar una migración en un entorno con datos que importan, se hace backup.** No es opcional, es precondición.

| Entorno | Nivel de riesgo | Backup obligatorio? |
|---|---|---|
| **prod** | Siempre crítico | **Sí, siempre.** Sin excepción. |
| **dev** compartido por equipo | Datos de trabajo del equipo, se pueden perder horas | **Sí**, salvo migración 🟢 trivial (add column nullable, seed pequeño). |
| **dev** individual / local reciente | Datos restaurables desde backup del repo | Recomendado pero no bloqueante. |

Comandos de backup del repo (viven en `README.md` raíz — consistente con las convenciones del equipo):

```bash
# DEV
docker exec dev_plataforma_postgres pg_dump -U postgres -p 5035 plataforma_dev \
  > backup_dev_$(date +%Y%m%d_%H%M%S).sql

# PROD
docker exec prod_plataforma_postgres pg_dump -U postgres -p 5030 plataforma_prod \
  > backup_prod_$(date +%Y%m%d_%H%M%S).sql
```

**Si la migración es 🔴 (DROP, TRUNCATE, ALTER TYPE, backfill masivo)**: además de backup, **probá el restore** en un entorno paralelo antes de aplicar en prod. Un backup que no se sabe si restaura es una falsa sensación de seguridad.

**En prod el deploy corre `alembic upgrade head` automáticamente** vía `backend/entrypoint.sh`. Hoy el entrypoint **no hace backup automático** (hueco conocido — documentado en ADR-0006, pendiente de automatización en un PR futuro). Mientras tanto, el mantenedor humano tiene que tomar el backup manualmente antes de aprobar el merge `develop → main` cuando el release-engineer reporta migraciones 🟡 o 🔴.

## Ubicación real de las migraciones

```
backend/alembic/versions/     Migraciones activas que corren en prod/dev.
├── 0001_baseline.py          Stub vacío — el schema inicial se asume existente (restore desde backup).
├── 0002_lotes_active_default_not_null.py
├── 0003_ambiente_unique_constraint_and_dedup.py
├── 0004_add_ensayos_table.py
├── 0005_seed_agroconsultor_crea_orgs.py
└── <siguiente>.py

alembic/versions/             Alembic legacy de la raíz del repo — NO se usa.
                              No agregues migraciones acá.
```

**Importante**: `backend/alembic/` es el alembic **activo**. El `alembic/` de la raíz tiene migraciones viejas y no lo referencia el backend. Si tocás migraciones, tocá solo `backend/alembic/versions/`.

## Convención de nombrado

Formato: `NNNN_descripcion_en_snake_case.py`

- `NNNN` → 4 dígitos secuenciales (`0001`, `0002`, `0003`, …). La siguiente es la mayor existente + 1.
- `descripcion` → snake_case en inglés, breve (3-6 palabras).
- El `revision` del frontmatter Python debe coincidir: `revision: str = '0006'`.

Ejemplos reales:
- `0002_lotes_active_default_not_null.py`
- `0004_add_ensayos_table.py`

## Comandos — siempre dentro del container

```bash
# Autogenerar (recomendado cuando cambiás models.py)
docker exec dev_plataforma_backend alembic revision --autogenerate -m "descripcion corta"

# Crear revisión en blanco (para backfill o seeds sin cambio de models)
docker exec dev_plataforma_backend alembic revision -m "descripcion corta"

# Ver estado actual
docker exec dev_plataforma_backend alembic current

# Aplicar hasta head
docker exec dev_plataforma_backend alembic upgrade head

# Ir a una revisión específica
docker exec dev_plataforma_backend alembic upgrade <revision>
docker exec dev_plataforma_backend alembic downgrade <revision>

# Stampear (marcar como aplicada sin ejecutar)
docker exec dev_plataforma_backend alembic stamp <revision>
```

## Protocolo obligatorio al crear una migración

### 1. Determinar el número siguiente

```bash
ls backend/alembic/versions/ | grep -E '^[0-9]{4}_' | sort | tail -1
```

La próxima migración es el número siguiente.

### 2. Renombrar archivo generado + ajustar revision/down_revision

Si usaste `--autogenerate`, Alembic crea un archivo con hash (`abc123_descripcion.py`). Renombralo a `NNNN_descripcion.py` y ajustá el frontmatter:
```python
revision: str = '0006'
down_revision: Union[str, None] = '0005'
```

### 3. Revisar el diff autogenerado

Alembic autogeneration **no es 100% confiable**. Revisar siempre:
- Columnas cuya unicidad no captura.
- Cambios de tipo que Alembic no detecta (ej. `VARCHAR` → `TEXT`).
- Constraints con nombres inferidos que conviene explicitar.

### 4. Backfill de datos existentes

Si la migración **agrega** una columna NOT NULL o con un default que no aplica retroactivamente, hay que rellenar las filas existentes antes de aplicar el constraint:

```python
def upgrade() -> None:
    # 1. Agregar columna como nullable
    op.add_column('lotes', sa.Column('active', sa.Boolean(), nullable=True))

    # 2. Backfill
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE lotes SET active = true WHERE active IS NULL"))

    # 3. Ahora sí, hacerla NOT NULL
    op.alter_column('lotes', 'active', nullable=False, server_default=sa.text('true'))
```

Esta es la convención **del repo**. Ver `0002_lotes_active_default_not_null.py` como referencia.

### 5. Migraciones idempotentes (regla dura)

**Toda migración debe ser idempotente: correrla N veces produce el mismo resultado que correrla 1 vez.** No es opcional.

**Por qué**: en operaciones reales aparecen escenarios donde una migración corre sobre una DB que ya tiene parte de sus efectos:
- Restore desde backup que ya tiene un schema avanzado.
- Drift entre `alembic_version` y schema real (ej. interventions manuales).
- Re-deploy después de un crash a mitad del entrypoint.

Sin idempotencia, la migración falla con `DuplicateColumn` / `DuplicateTable` / `UniqueViolation` y deja al backend en restart loop. Con idempotencia, los guards detectan que el estado ya está aplicado y skipean silenciosamente.

#### Helpers estándar

Copiá estos al inicio del archivo de migración (después de los imports). Son baratos y ya están probados en el repo:

```python
def _table_exists(conn, table_name: str) -> bool:
    return conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = :t)"
    ), {"t": table_name}).scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    return conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c)"
    ), {"t": table_name, "c": column_name}).scalar()


def _index_exists(conn, index_name: str) -> bool:
    return conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :i)"
    ), {"i": index_name}).scalar()


def _constraint_exists(conn, constraint_name: str) -> bool:
    return conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = :c)"
    ), {"c": constraint_name}).scalar()
```

#### Patterns por tipo de operación

**`add_column`** — guard con `_column_exists`:
```python
if not _column_exists(conn, 'organizaciones', 'color_secundario'):
    op.add_column('organizaciones', sa.Column('color_secundario', sa.String(), nullable=True))
```

**`create_table`** — guard con `_table_exists`:
```python
if not _table_exists(conn, 'ensayos'):
    op.create_table('ensayos', sa.Column('id', sa.Integer(), primary_key=True), ...)
```

**`create_index` / `create_unique_constraint`** — guard con el helper correspondiente:
```python
if not _index_exists(conn, 'ix_lotes_id_licencia'):
    op.create_index('ix_lotes_id_licencia', 'lotes', ['id_licencia'])

if not _constraint_exists(conn, 'uq_ambientes_campania_capa'):
    op.create_unique_constraint('uq_ambientes_campania_capa', 'ambientes', ['id_campania', 'capa'])
```

**Seed con `INSERT`** — chequear existencia por clave natural antes:
```python
existing = conn.execute(sa.text(
    "SELECT id FROM organizaciones WHERE nombre = :n"
), {"n": "Agroconsultor"}).scalar()
if existing is None:
    conn.execute(sa.text(
        "INSERT INTO organizaciones (nombre) VALUES (:n)"
    ), {"n": "Agroconsultor"})
```

O, cuando hay un constraint UNIQUE sobre la clave natural, usar `ON CONFLICT`:
```python
conn.execute(sa.text('''
    INSERT INTO organizaciones (nombre) VALUES (:n)
    ON CONFLICT (nombre) DO NOTHING
'''), {"n": "Crea"})
```

**Backfill `UPDATE`** — naturalmente idempotente si el `WHERE` está bien filtrado (ej. `WHERE col IS NULL`). Re-ejecutar es no-op porque ya no quedan filas que matcheen.

**Skip de bloque entero** — si toda una sección de seed ya corrió, short-circuit con un check de "estado final" + early `return`:
```python
def upgrade() -> None:
    conn = op.get_bind()
    # ... DDL idempotente arriba ...

    # Skip seed entero si las orgs target ya están
    if (conn.execute(sa.text(
            "SELECT COUNT(*) FROM organizaciones WHERE nombre IN ('Agroconsultor', 'Crea')"
        )).scalar() == 2):
        print("[migration] seed ya aplicado — skip")
        return
    # ... seed ...
```

#### Idempotencia en `downgrade()` también

Mismo principio que en upgrade: el downgrade debe sobrevivir a una segunda ejecución.
```python
if _column_exists(conn, 'organizaciones', 'color_secundario'):
    op.drop_column('organizaciones', 'color_secundario')
```

#### Orden de operaciones para evitar FK violations en downgrade

Cuando el downgrade borra rows referenciadas por FKs desde otras tablas, Postgres aborta con `ForeignKeyViolation` salvo que la FK tenga `ON DELETE CASCADE` (no la default). Patrón seguro:

1. **Capturá los IDs target en una variable Python** ANTES de modificar nada.
2. **Nullear el FK en las tablas que referencian** (`UPDATE child SET fk = NULL WHERE ...`).
3. **Después sí, `DELETE`** de las rows target por la lista capturada.

Ejemplo real (downgrade de 0005, post fix):
```python
# 1. Capturar IDs de licencias linkeadas a lotes de esta org
licencia_ids = conn.execute(sa.text('''
    SELECT DISTINCT l.id_licencia FROM lotes l
    JOIN empresas e ON l."idEmpresa" = e.id
    WHERE e."idOrganizacion" = :oid AND l.id_licencia IS NOT NULL
'''), {"oid": org_id}).scalars().all()

# 2. Nullear FK lotes.id_licencia → licencias.id
conn.execute(sa.text('''
    UPDATE lotes SET id_licencia = NULL WHERE "idEmpresa" IN (
        SELECT id FROM empresas WHERE "idOrganizacion" = :oid
    ) AND id_licencia IS NOT NULL
'''), {"oid": org_id})

# 3. Ahora sí, DELETE FROM licencias por la lista capturada
if licencia_ids:
    conn.execute(
        sa.text('DELETE FROM licencias WHERE id = ANY(:ids)'),
        {"ids": list(licencia_ids)},
    )
```

Si invertís el orden (DELETE antes de UPDATE), Postgres aborta y la migración no se puede revertir limpio — bug exacto que se arregló en `0005_seed_agroconsultor_crea_orgs.py`.

Ver `0005_seed_agroconsultor_crea_orgs.py` post-fix como referencia integrada (helpers + guards + FK order correcto).

### 6. Función `downgrade()` — obligatoria

Toda migración tiene que tener `downgrade()` implementado, aunque sea básico:
```python
def downgrade() -> None:
    op.drop_column('lotes', 'active')
```

Si el downgrade es destructivo (borra datos), comentalo explícitamente:
```python
def downgrade() -> None:
    # ADVERTENCIA: esto borra los datos de las columnas agregadas.
    op.drop_column(…)
```

## Zero-downtime — reglas pragmáticas

El backend se redeploya con una nueva imagen Docker. Para evitar que un request en vuelo falle porque la DB cambió antes que el código:

| Cambio | Orden seguro |
|---|---|
| **Agregar columna nullable** | DB primero, deploy después. Zero-downtime OK. |
| **Agregar columna NOT NULL con default** | DB primero (columna + backfill + constraint), deploy después. OK si el backfill es rápido. |
| **Renombrar columna** | Dos pasos: 1) agregar nueva, migrar datos, deploy código que escribe en ambas; 2) deploy que lee de la nueva; 3) drop de la vieja. NO hacerlo en una sola migración. |
| **Drop de columna que el código actual usa** | Primero deploy del código que no la usa; después la migración drop. |
| **Cambio de tipo** | Evitar — hacé columna nueva + backfill + drop vieja en migraciones separadas. |

## Checklist obligatorio al cerrar una migración

- [ ] Ubicada en `backend/alembic/versions/` (no `alembic/versions/` de la raíz).
- [ ] Nombre del archivo con 4 dígitos consecutivos: `NNNN_descripcion.py`.
- [ ] `revision` y `down_revision` correctos en el frontmatter.
- [ ] `upgrade()` testeada en local: `docker exec dev_plataforma_backend alembic upgrade head`.
- [ ] `downgrade()` implementada y testeada: downgrade → upgrade vuelve al mismo estado.
- [ ] **`upgrade()` es idempotente**: corrida dos veces no falla ni duplica data. Toda DDL (`add_column`, `create_table`, `create_index`, `create_unique_constraint`) y todo `INSERT` de seed va con guard (`_column_exists` / `_table_exists` / `_index_exists` / `_constraint_exists` / chequeo de existencia por clave natural / `ON CONFLICT`).
- [ ] **`downgrade()` es idempotente**: drops envueltos en guard (ej. `if _column_exists(...): op.drop_column(...)`).
- [ ] **`downgrade()` respeta orden de FKs**: si borra rows que están referenciadas, primero captura IDs, nullear los FKs entrantes, recién después `DELETE`.
- [ ] Si hace backfill: columna nullable primero, UPDATE, constraint después.
- [ ] Si referencia tablas opcionales: guard con `_table_exists`.
- [ ] Coordinación con deploy pensada (ver tabla de zero-downtime).
- [ ] Si afecta prod: documentar el orden de ops (DB → deploy, o deploy → DB) en el PR.

## Qué NO hacer

- **No editar una migración ya mergeada a `develop` o `main`**. Creá una nueva que ajuste.
- **No ejecutar DDL directo con `psql`** en vez de una migración — rompe el tracking de Alembic.
- **No bajar manualmente `alembic_version`** con `UPDATE` directo salvo que sea un rescate documentado.
- **No usar el `alembic/` de la raíz** — está obsoleto.
- **No hacer migraciones que durmen** (SELECT pg_sleep) en prod — si necesitás esperar, partí el cambio en varias migraciones.
