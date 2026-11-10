import { createHash, randomBytes } from 'crypto';
import { getRounds } from 'bcrypt';

/**
 * Costo de bcrypt para contraseñas nuevas. 12 es la recomendación actual de
 * OWASP para bcrypt; los hashes viejos (costo 10) siguen validando porque el
 * costo viaja dentro del propio hash.
 */
export const BCRYPT_ROUNDS = 12;

/**
 * Hash con el que se comparan las contraseñas cuando el email no existe, para
 * que el login tarde lo mismo en los dos casos. Sin esto, la diferencia de
 * tiempo (bcrypt sí/no) alcanzaba para saber qué emails están registrados.
 * Es el hash de un valor aleatorio descartado: no coincide con ninguna clave.
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$12$wofvnrioOpCiYHNbhEq6nuE5ScKM5mpkm1X/L7ApA225mSnLJPi5K';

// El dummy tiene que tener el MISMO costo que los hashes reales: con costos
// distintos, el tiempo vuelve a delatar qué emails existen. Las cuentas creadas
// antes del cambio a 12 (costo 10) se re-hashean en su próximo login exitoso
// (AuthService.login), así que todo converge a BCRYPT_ROUNDS.

/** true si el hash se generó con un costo menor al actual y conviene re-hashear. */
export function needsRehash(hash: string): boolean {
  try {
    return getRounds(hash) < BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}

/** SHA-256 en hex. Los tokens opacos se guardan así, nunca en claro. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Token opaco para links de email (verificación, reset) y refresh tokens.
 *
 * El valor en claro solo viaja al usuario (mail o respuesta); en la base queda
 * el SHA-256. Antes se guardaban en claro: con un dump de la base (un backup
 * filtrado, por ejemplo) alcanzaba para resetear la clave de cualquier cuenta.
 * SHA-256 sin sal es suficiente porque el token ya tiene 256 bits aleatorios.
 */
export function generateOpaqueToken(bytes = 32): { token: string; tokenHash: string } {
  const token = randomBytes(bytes).toString('hex');
  return { token, tokenHash: hashToken(token) };
}
