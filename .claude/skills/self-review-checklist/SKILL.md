---
name: self-review-checklist
description: Pasada de auto-revisión antes de cerrar una tarea y abrir PR. Usar cuando el trabajo esté terminado y antes de invocar a qa-engineer o abrir el PR. Cubre tests, lint, formato, diff limpio, secretos, edge cases y cumplimiento de criterios de aceptación.
---

# Skill: Self-review checklist

Pasada rápida antes de cerrar una tarea. Si salís de acá con items en rojo, **no abrás PR** — arreglá primero. Si pasa todos los checks, invocá al subagente `qa-engineer` para la validación formal.

## Los 8 items

### 1. ¿Los tests pasan localmente?

Frontend:
```bash
cd frontend && npm test
```
Backend: el repo no tiene suite pytest formal hoy. Si hay tests nuevos relevantes al cambio, corrilos manualmente dentro del container:
```bash
docker exec dev_plataforma_backend python <test_script>.py
```

Si escribiste tests nuevos, que pasen los suyos + los que ya existían (que no rompas nada preexistente).

### 2. ¿El lint está limpio?

Frontend:
```bash
cd frontend && npm run lint
```
Esperable: cero errores. Los warnings valen la pena mirarlos — si no son falsos positivos, arreglalos o comentá por qué se dejan.

Backend: el repo no tiene linter configurado formal (ruff/flake8 ausentes). Revisá manualmente: imports no usados, variables no usadas, líneas >120 chars.

### 3. ¿El formatter corrió?

El repo no tiene prettier ni black configurados. Respetá el estilo del código circundante (indentación, comillas, espacios) — `git diff` te muestra si estás introduciendo inconsistencia.

Si el editor te autoformatea distinto, revertilo antes de stagear — no metas cambios de formato masivos en un commit de feature.

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
- Buscá nombres similares en el repo: `grep -r "nombreSimilar" --include="*.ts" --include="*.py"`.
- Si hay un patrón establecido (ej. `getXyz` vs `fetchXyz` vs `loadXyz`), seguilo.
- Naming cross-layer: si el backend devuelve `rinde_qq_ha`, no lo mapees a `yield` en frontend sin razón — consistencia reduce fricción.

### 6. ¿Hay secretos, credenciales o tokens hardcodeados?

Revisar el diff:
```bash
git diff --cached | grep -iE "password|secret|token|api[_-]?key|bearer"
```

Lo que **nunca** va en el código:
- Passwords, API keys, JWT secrets, tokens de acceso.
- URLs de producción con credenciales embebidas.
- Backups SQL con datos reales.

Todo eso va por variables de entorno (`os.getenv(...)` en backend, `process.env.*` en frontend — pero cuidado con prefijos `NEXT_PUBLIC_` que sí exponen al cliente).

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
- **Permisos**: usuario sin acceso, usuario de otra organización (multi-tenant del backend).
- **Estado inicial**: qué ve el usuario si no hay datos todavía.
- **Error del servidor**: ¿cómo se recupera la UI si la API responde 500?

Si no tenés tiempo de cubrirlos **todos**, anotá los que dejás fuera en el PR.

---

## Cuándo invocar esta skill

- Idealmente **antes** de `/commit`, para stagear ya limpio.
- Obligatoriamente **antes** de delegar al subagente `qa-engineer` — no le hagas perder tiempo con cosas que te tocan a vos.
- Antes de `/pr` si no la corriste en los dos puntos anteriores.

Esta skill es de **corrección rápida**, no exhaustiva. La validación formal la hace `qa-engineer`.
