-- Búsqueda de ciudades tolerante a acentos. Postgres ILIKE (el `mode:
-- 'insensitive'` de Prisma) ignora mayúsculas pero NO diacríticos, así que
-- "cordoba" nunca matcheaba "Córdoba". Se guarda el nombre ya normalizado en
-- una columna propia en vez de normalizar dentro de cada query: así el filtro
-- sigue siendo un LIKE simple y no un unaccent() por fila.
-- Va sin índice a propósito — ver el comentario de `searchName` en schema.prisma.

-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "search_name" TEXT NOT NULL DEFAULT '';

-- Backfill. La fuente de verdad es `normalizeSearchText` (TypeScript) y el
-- seed reescribe al arrancar cualquier fila que difiera, pero el seed puede
-- fallar sin tumbar el boot (`|| echo "Seed skipped"` en docker-entrypoint.sh):
-- con este UPDATE la búsqueda queda usable igual.
-- El translate() saca acentos y, además, el soft-hyphen (U+00AD = chr(173)): el
-- snapshot del padrón traía 53 localidades con uno incrustado por un mal decode
-- de origen. El JSON ya está corregido y el seed reescribe esos nombres, pero
-- esto corre ANTES del seed y sobre filas que todavía los tienen rotos.
-- Se borra porque no tiene contraparte: `to` es un caracter más corto que `from`.
UPDATE "cities"
SET "search_name" = btrim(
  regexp_replace(
    lower(translate("name", 'ÁÉÍÓÚÜÑáéíóúüñö' || chr(173), 'aeiouunaeiouuno')),
    '\s+', ' ', 'g'
  )
);
