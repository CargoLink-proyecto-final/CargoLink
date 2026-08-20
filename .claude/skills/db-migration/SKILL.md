---
name: db-migration
description: Crear, modificar o "rollbackear" una migración de base de datos con Prisma en este repo. Usar cuando la tarea implique cambios de schema (agregar/quitar modelo, columna, enum, índice, constraint), backfill de datos, seeds, o restore desde backup. Toca archivos bajo backend/prisma/ (schema.prisma, migrations/, seed.ts).
---

# Skill: Database migration

Guía para cambios de schema y datos en la DB de CargoLink usando **Prisma 5**. DB: PostgreSQL 15. El schema es `backend/prisma/schema.prisma`; las migraciones viven en `backend/prisma/migrations/`. **No hay Alembic ni SQLAlchemy — todo es Prisma.**

## Cómo funcionan las migraciones de Prisma

A diferencia de otros ORMs, Prisma genera las migraciones **diffeando el `schema.prisma` contra el estado actual de la DB**. El flujo:

1. Editás `schema.prisma` (agregás/cambiás un modelo, campo, enum, índice).
2. Corrés `npx prisma migrate dev --name <slug>`.
3. Prisma genera un archivo `prisma/migrations/<timestamp>_<slug>/migration.sql` (SQL plano), lo **aplica** a la DB de dev, y **regenera el cliente** (`@prisma/client`).

Claves a entender:
- Las migraciones son **forward-only**: Prisma **no genera down-migrations**. No existe `downgrade()`. Para revertir, escribís una migración correctiva nueva (ver § "Cómo revertir").
- El SQL queda versionado en `migration.sql` — se revisa como cualquier código.
- `migration_lock.toml` registra el provider (`postgresql`). **No editarlo.**
- El nombre lo genera Prisma (`<timestamp>_<slug>`); vos elegís el slug — en snake_case, descriptivo (`add_email_verification`, `add_price_negotiation`).

## Regla dura — Backup antes de aplicar a prod

**Antes de aplicar una migración en un entorno con datos que importan, se hace backup.** No es opcional, es precondición.

| Entorno | Backup obligatorio? |
|---|---|
| **prod** | **Sí, siempre.** Sin excepción. |
| **dev** compartido | Recomendado salvo cambio 🟢 trivial (add column nullable, índice nuevo). |
| **dev** local / efímero | No bloqueante — `npx prisma migrate reset` regenera todo + seed. |

**Importante — gap conocido del setup:** en prod, `backend/docker-entrypoint.sh` corre **`npx prisma migrate deploy` automáticamente al startup**, antes de levantar el server. Es decir, **todo lo que esté en `prisma/migrations/` se aplica sin intervención manual** en el primer arranque post-deploy, y **no hay backup automático**. El mantenedor humano tiene que tomar el backup manualmente antes de mergear `develop → main` cuando hay migraciones 🟡/🔴 (ver `docs/deployment.md`).

Comandos de backup (de `docs/deployment.md`):

```bash
# dump (formato custom, recomendado)
docker compose exec postgres pg_dump -U postgres -Fc cargolink > backup-$(date +%F-%H%M).dump

# restore
docker compose exec -T postgres pg_restore -U postgres -d cargolink --clean --if-exists < backup.dump
```

Clasificación de riesgo:
- 🟢 **bajo**: add column nullable, nuevo modelo/tabla, nuevo índice, agregar valor a un enum.
- 🟡 **medio**: rename de columna/tabla, índice único nuevo (puede fallar con datos duplicados), cambio de tipo.
- 🔴 **alto**: drop column, drop table, cambios de FK que requieren backfill, `NOT NULL` sobre columna existente con filas.

Para 🔴: además del backup, **probá el restore** en un entorno paralelo antes de prod.

## Migraciones existentes (referencia)

```
backend/prisma/migrations/
├── 20260401174523_init/                  Schema inicial: users, loads, trips.
├── 20260408195158_add_trip_messages/     Tabla messages con relación a trips.
├── 20260515211044_rename_user_roles/     Refinamiento del enum Role.
├── 20260515223353_add_email_verification/ Campos emailVerified + tokens.
├── 20260516230123_add_postulations/      Tabla postulations (flujo de bidding).
├── 20260520000000_add_price_negotiation/ Columnas counterOfferPrice, lastOfferBy.
└── migration_lock.toml                    Provider lock — NO editar.
```

## Comandos

```bash
cd backend

# DEV — editar schema.prisma primero, luego:
npx prisma migrate dev --name <slug-descriptivo>   # genera + aplica + regenera cliente
# (equivalente: npm run prisma:migrate)

# Regenerar solo el cliente (ej. tras pull con migraciones nuevas)
npx prisma generate                                # (npm run prisma:generate)

# Aplicar migraciones pendientes sin generar nuevas (CI / prod)
npx prisma migrate deploy                          # lo que corre docker-entrypoint.sh

# Ver estado / drift entre migraciones y DB
npx prisma migrate status

# Resetear DB local (⚠️ BORRA TODO) — re-aplica desde cero + corre seed
npx prisma migrate reset

# Marcar una migración como aplicada/revertida sin ejecutarla (rescate de drift)
npx prisma migrate resolve --applied <migration_name>
npx prisma migrate resolve --rolled-back <migration_name>

# Inspector visual de datos
npx prisma studio                                  # http://localhost:5555
```

Dentro del contenedor Docker (cuando el stack está levantado):
```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend node dist/prisma/seed.js
```

## Protocolo al crear una migración

1. **Una migración por cambio lógico.** No mezclar "agregar columna" + "renombrar tabla" en una sola.
2. **Editá `schema.prisma`** con el cambio. Respetá las convenciones del repo:
   - IDs `String @id @default(uuid())`.
   - Columnas DB en snake_case vía `@map("...")`; tabla con `@@map("...")`.
   - **Indexá lo que vas a filtrar/joinear** — Prisma no agrega índices solo. Agregá `@@index([...])`.
3. **Generá y aplicá**: `npx prisma migrate dev --name <slug>`.
4. **Revisá el `migration.sql` generado.** Es SQL plano: verificá que el diff sea el que esperabas (no un drop accidental, no un cambio de tipo destructivo silencioso). Prisma puede pedir reset de DB si detecta drift — **nunca aceptes el reset en una DB con datos reales**.
5. **Commiteá schema + carpeta de migración juntos**, en el mismo commit.

### Backfill de columna NOT NULL

Si agregás una columna `NOT NULL` a una tabla con filas, Postgres falla salvo que des un default. Patrón seguro — partilo en pasos:

1. Agregá la columna **nullable** (o con `@default(...)`) en `schema.prisma` → migración 1.
2. Backfilleá los datos (seed script, o un `UPDATE` editando el `migration.sql` a mano).
3. En una migración 2 posterior, hacela `NOT NULL`.

Si el campo tiene un `@default` que aplica a todas las filas, Prisma lo resuelve en una sola migración.

## Cómo revertir ("rollback") — Prisma es forward-only

**No hay down-migration.** Para deshacer un cambio:

1. **En dev local**: lo más simple es `npx prisma migrate reset` (borra y re-aplica todo + seed). Solo si los datos son descartables.
2. **Cambio ya commiteado / en otro entorno**: editás `schema.prisma` para dejarlo como querés y creás una **migración correctiva nueva** (`npx prisma migrate dev --name revert_xxx`). Esa migración genera el SQL inverso (drop de la columna que habías agregado, etc.).
3. **Drift entre `_prisma_migrations` y la DB real** (ej. una migración corrió a medias): usá `npx prisma migrate resolve --rolled-back <name>` o `--applied <name>` para alinear el registro sin re-ejecutar SQL. Es un rescate documentado, no rutina.

**No editar una migración ya aplicada/mergeada** — creá una nueva que corrija. Editar SQL ya aplicado rompe el checksum que Prisma guarda en `_prisma_migrations`.

## Seed

Archivo: `backend/prisma/seed.ts`. Es **idempotente**:
- Users vía `prisma.user.upsert()` por email (no duplica).
- Load demo vía `findFirst` por `(shipperId, title)` + `create` si no existe.

Crea 12 cuentas demo (1 ADMIN, 1 CARGO_GENERATOR, 1 COMPANY_ADMIN y 9 TRANSPORTER — incluidos `profe1-3` y `transportista1-2`), la empresa "Flota Andina" con 2 choferes + 1 solicitud `PENDING`, y 1 load demo. Password `password123` hasheada con bcrypt, salvo la del admin, que sale de `ADMIN_PASSWORD` (si está seteada, se reescribe en cada corrida; si no, el fallback se aplica solo al crear).

```bash
cd backend && npm run prisma:seed         # ts-node prisma/seed.ts
```

`prisma migrate reset` corre el seed automáticamente al final. Si agregás datos al seed, mantené la idempotencia (`upsert` / check-before-insert) — corre en cada deploy vía el entrypoint.

## Zero-downtime — reglas pragmáticas

El backend se redeploya con imagen nueva y la migración corre al startup. Para no romper requests en vuelo:

| Cambio | Orden seguro |
|---|---|
| Agregar columna nullable / con default | DB primero, deploy después. OK. |
| Agregar índice | OK en cualquier orden (cuidado con índices únicos sobre datos con duplicados — fallan). |
| Renombrar columna | **Expand & contract**: 1) agregar la nueva + backfill + deploy que escribe en ambas; 2) deploy que lee de la nueva; 3) migración que dropea la vieja. No en una sola migración. |
| Drop de columna que el código usa | Primero deploy del código que no la usa; después la migración que la dropea. |
| Cambio de tipo | Evitar in-place — columna nueva + backfill + drop vieja en migraciones separadas. |

## Checklist al cerrar una migración

- [ ] `schema.prisma` editado con el cambio + índices necesarios (`@@index`).
- [ ] `npx prisma migrate dev --name <slug>` corrido en local; `migration.sql` generado y revisado.
- [ ] El SQL generado no tiene drops/cambios de tipo destructivos inesperados.
- [ ] `npx prisma generate` corrido (lo hace `migrate dev` solo) — el cliente tipado refleja el schema.
- [ ] **Schema + carpeta de migración commiteados juntos** en el mismo commit.
- [ ] Una migración por cambio lógico (no mezclar cambios no relacionados).
- [ ] Si hace backfill / NOT NULL sobre tabla con datos: partido en pasos (nullable → backfill → NOT NULL).
- [ ] Riesgo clasificado (🟢/🟡/🔴) y, si 🟡/🔴, plan de backup pre-deploy anotado en el PR.
- [ ] No editaste una migración ya aplicada/mergeada.
- [ ] `migration_lock.toml` intacto.

## Qué NO hacer

- **No editar una migración ya aplicada o mergeada** — rompe el checksum de `_prisma_migrations`. Creá una correctiva.
- **No correr DDL directo con `psql`** salteándote Prisma — genera drift.
- **No aceptar el reset de DB que ofrece `prisma migrate dev`** en una DB con datos reales.
- **No tocar `migration_lock.toml`.**
- **No commitear `schema.prisma` sin su migración** (ni al revés) — quedan desincronizados.
