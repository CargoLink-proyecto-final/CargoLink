/** Tope de filas por página que acepta cualquier listado de la API. */
export const MAX_PAGE_SIZE = 100;

/**
 * Normaliza `page`/`limit` de un query string.
 *
 * Sin tope, `?limit=1000000` hacía que Postgres y el server armaran la tabla
 * entera en una sola respuesta: una forma barata de tumbar el backend o de
 * volcar todo de un saque. Valores inválidos (negativos, NaN) caen al default.
 */
export function parsePagination(
  page: unknown,
  limit: unknown,
  defaultLimit = 20,
  maxLimit = MAX_PAGE_SIZE,
): { page: number; limit: number; skip: number } {
  const p = Math.floor(Number(page));
  const l = Math.floor(Number(limit));
  const safePage = Number.isFinite(p) && p >= 1 ? p : 1;
  const safeLimit = Number.isFinite(l) && l >= 1 ? Math.min(l, maxLimit) : defaultLimit;
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}
