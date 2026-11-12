---
name: self-review-checklist
description: Pasada de auto-revisión antes de cerrar una tarea y abrir PR. Usar cuando el trabajo esté terminado y antes de invocar a qa-engineer o abrir el PR. Cubre tests, lint, formato, diff limpio, secretos, edge cases y cumplimiento de criterios de aceptación.
---

# Skill: Self-review checklist

Pasada rápida antes de cerrar una tarea. Si salís de acá con items en rojo, **no abrás PR** — arreglá primero. Si pasa todos los checks, invocá al subagente `qa-engineer` para la validación formal.

## Los 8 items

### 1. ¿Los tests pasan localmente?

Backend (Jest):
```bash
cd backend && npm test
```
Hay infra de Jest configurada (`*.spec.ts`); si el repo todavía no tiene specs y escribiste tests nuevos, que pasen los suyos + los preexistentes.

Frontend: `cd frontend && npm test` (jest + @testing-library/react). Mobile: `cd mobile && npm test` (jest-expo) y `npm run typecheck`. Correr **las tres** suites: un cambio de layout o de un cliente de API rompe tests de otra capa, y afirmar que el frontend no tiene tests ya costó un bloqueante.

Si escribiste tests nuevos, que pasen los suyos + los que ya existían (que no rompas nada preexistente).

### 2. ¿El lint está limpio?

Backend (NestJS, eslint):
```bash
cd backend && npm run lint
```
Frontend (Next.js, eslint):
```bash
cd frontend && npm run lint
```
Esperable: cero errores en ambos. Los warnings valen la pena mirarlos — si no son falsos positivos, arreglalos o comentá por qué se dejan.

### 3. ¿Los tipos compilan (TypeScript strict)?

Todo el repo es TypeScript strict. Si el build falla por tipos, no cierres la tarea:
```bash
cd backend && npm run build      # nest build (tsc)
cd frontend && npm run build     # next build
```
`npm run lint` ya corre con type-aware rules, pero el build es la verificación dura de tipos. No metas `any` sin comentar por qué.

El `npm run lint` del backend corre con `--fix`. Si el editor te autoformatea distinto al estilo circundante, revertilo antes de stagear — no metas cambios de formato masivos en un commit de feature.

### 4. ¿El diff tiene solo los cambios de la tarea?

Corré:
```bash
git diff --cached --stat
git diff --cached
```

Buscá y remové antes de commitear:
- `console.log()`, `print()` de debug.
- `debugger`, `breakpoint()`.
- Archivos temporales (`.tmp`, `.bak`, `.DS_Store`).
- Cambios ruidosos no relacionados al ticket (ej. reformateo de archivos que no tocaste).
- `TODO` genéricos sin contexto — si algo queda pendiente, anotalo en el issue/PR, no como comment sin owner.

Regla: un reviewer humano debería entender **cada línea** del diff como parte de la tarea descrita.

### 5. ¿Los nombres elegidos son consistentes con el codebase?

Antes de aceptar un nombre nuevo (variable, función, endpoint, columna, archivo):
- Buscá nombres similares en el repo: `grep -rn "nombreSimilar" --include="*.ts" --include="*.tsx"`.
- Si hay un patrón establecido (ej. `getXyz` vs `fetchXyz` vs `loadXyz`), seguilo.
- Naming cross-layer: el backend devuelve camelCase (Prisma mapea las columnas snake_case de la DB). Mantené el mismo nombre del campo entre backend y frontend (ej. `proposedPrice`, `originLat`) — no lo renombres sin razón.

### 6. ¿Hay secretos, credenciales o tokens hardcodeados?

Revisar el diff:
```bash
git diff --cached | grep -iE "password|secret|token|api[_-]?key|bearer"
```

Lo que **nunca** va en el código:
- Passwords, API keys, JWT secrets, tokens de acceso.
- URLs de producción con credenciales embebidas.
- Backups SQL con datos reales.

Todo eso va por variables de entorno (`process.env.*` / `ConfigService` en el backend NestJS, `process.env.*` en frontend — pero cuidado con prefijos `NEXT_PUBLIC_` que sí exponen al cliente). Ojo especial con `JWT_SECRET`, credenciales SMTP y `DATABASE_URL`.

### 7. ¿Los criterios de aceptación del ticket están todos cumplidos?

Releé la descripción de la tarea. Para cada criterio:
- ¿Está implementado?
- ¿Probaste el happy path?
- ¿Coincide el comportamiento real con lo pedido, no solo lo parecido?

Si algún criterio quedó afuera deliberadamente, escribilo en el body del PR (sección "Fuera de scope").

### 8. ¿Hay edge cases obvios no cubiertos?

Pasada rápida mental o con tests:
- **Nulos/undefined**: campos opcionales en el schema, respuestas sin payload, arrays vacíos.
- **Límites**: valores cero, negativos, máximos.
- **Concurrencia**: doble submit del mismo form, dos requests superpuestos.
- **Permisos**: usuario sin JWT, rol incorrecto (CARGO_GENERATOR vs TRANSPORTER vs ADMIN), ownership (shipper accediendo a una carga ajena, carrier a un trip que no es suyo).
- **Estado inicial**: qué ve el usuario si no hay datos todavía.
- **Error del servidor**: ¿cómo se recupera la UI si la API responde 500?

Si no tenés tiempo de cubrirlos **todos**, anotá los que dejás fuera en el PR.

### 9. ¿Tocaste el schema de Prisma? (solo si aplica)

Si el diff toca `backend/prisma/`:
- [ ] Corriste `npx prisma migrate dev --name <slug>` y se generó la carpeta de migración en `backend/prisma/migrations/`.
- [ ] **`schema.prisma` + la carpeta de migración están commiteados juntos** (no uno sin el otro).
- [ ] `npx prisma generate` corrido (lo hace `migrate dev` solo) — el cliente tipado refleja el schema.
- [ ] Revisaste el `migration.sql` generado — sin drops/cambios de tipo destructivos inesperados.
- [ ] No editaste una migración ya aplicada/mergeada (si te equivocaste, migración correctiva nueva).
- [ ] Clasificaste el riesgo (🟢/🟡/🔴) y, si 🟡/🔴, anotaste el plan de backup pre-deploy en el PR.

Detalle completo en la skill `db-migration`.

---

## Cuándo invocar esta skill

- Idealmente **antes** de `/commit`, para stagear ya limpio.
- Obligatoriamente **antes** de delegar al subagente `qa-engineer` — no le hagas perder tiempo con cosas que te tocan a vos.
- Antes de `/pr` si no la corriste en los dos puntos anteriores.

Esta skill es de **corrección rápida**, no exhaustiva. La validación formal la hace `qa-engineer`.
