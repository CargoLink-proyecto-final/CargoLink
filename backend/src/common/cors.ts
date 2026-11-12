export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

/**
 * Orígenes permitidos según `CORS_ORIGIN` (uno o varios separados por coma, ej.
 * durante una migración de dominio). Lo usan tanto HTTP (`main.ts`) como el
 * gateway de Socket.IO, que antes aceptaba cualquier origen (`'*'`).
 */
export function parseCorsOrigins(raw: string | undefined = process.env.CORS_ORIGIN): string[] {
  const origins = (raw || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Si CORS_ORIGIN quedara vacío (ej. "," o " "), caer al default en vez de
  // pasar un array vacío, que bloquearía todo origen cruzado.
  return origins.length > 0 ? origins : [DEFAULT_CORS_ORIGIN];
}
