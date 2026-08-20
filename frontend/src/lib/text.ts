/**
 * Normalización para búsquedas tolerantes en los combos con type-ahead: sin
 * acentos, sin mayúsculas y sin caracteres invisibles (soft-hyphen, zero-width,
 * BOM). Escribir "cordoba" tiene que encontrar "Córdoba", y "canuelas" a
 * "Cañuelas" (NFD descompone la "ñ" y el strip se lleva la tilde — es
 * intencional).
 *
 * Espejo exacto de `backend/src/common/text.ts`, que es lo que alimenta la
 * columna `cities.search_name` contra la que busca el server. Si cambia una,
 * cambian las dos: si divergen, el filtrado local y el remoto dejan de coincidir.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
