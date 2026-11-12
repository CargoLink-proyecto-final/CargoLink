# Fuentes del frontend

Fuentes variables (eje `wght`, subset latin) que usa `src/app/layout.tsx` con `next/font/local`. Están en el repo para que el build no dependa de descargar nada de Google Fonts (#160).

| Archivo | Familia | Origen | Licencia |
|---|---|---|---|
| `outfit-latin-wght-normal.woff2` | Outfit | `@fontsource-variable/outfit@5.3.0` | [OFL 1.1](./OFL-outfit.txt) |
| `manrope-latin-wght-normal.woff2` | Manrope | `@fontsource-variable/manrope@5.3.0` | [OFL 1.1](./OFL-manrope.txt) |
| `jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono | `@fontsource-variable/jetbrains-mono@5.3.0` | [OFL 1.1](./OFL-jetbrains-mono.txt) |

Para actualizarlas: bajar el `.woff2` de `https://cdn.jsdelivr.net/npm/@fontsource-variable/<familia>@<versión>/files/<familia>-latin-wght-normal.woff2`, reemplazar el archivo y actualizar esta tabla.
