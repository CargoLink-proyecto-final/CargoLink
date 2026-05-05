---
description: Lista commits del repo upstream Pronosticos que faltan portar a Plataforma
---

El usuario quiere ver qué commits upstream están pendientes de portar.

## 1. Correr el script

```bash
bash scripts/upstream/pending.sh
```

Esto:
- Lee el último sha cubierto de `UPSTREAM.md`.
- Lista commits en `origin/main` del upstream local posteriores a ese sha.

Si el script falla:
- `UPSTREAM.md` ausente o sin sha legible → guiar al usuario a inicializarlo.
- Upstream local ausente → guiar a clonar `RindePlus/Pronosticos` en `../Pronosticos` (o setear `UPSTREAM_REPO_PATH`).
- Sha del puntero no existe en upstream local → sugerir `git -C ../Pronosticos fetch origin`.

## 2. Presentar el resultado al usuario

- Si **no hay pendientes**: avisá y terminá.
- Si hay pendientes: mostrá la lista tal cual y preguntale al usuario cómo proceder. Opciones típicas:
  1. Inspeccionar uno con detalle: `bash scripts/upstream/inspect.sh <sha>` (o con `--diff` para el diff completo).
  2. Portarlo directamente: invocar `/upstream-port <sha>`.
  3. Postergar y solo ver el inventario.

## 3. Si elige inspeccionar

Corré `bash scripts/upstream/inspect.sh <sha>` con el sha que indique. Mostrá la salida y volvé a preguntar si quiere portarlo.

## 4. Si elige portar

Invocá `/upstream-port <sha>` siguiendo ese flujo. No mezcles los pasos de `/upstream-port` acá.

---

## Notas

- No portees nada sin confirmación explícita del usuario.
- No actualices `UPSTREAM.md` desde este command — eso lo hace `/upstream-port` al final del portado real.
