import { ConfigService } from '@nestjs/config';

// Valores de ejemplo que vienen en los `.env.example`: si alguno llega a un
// entorno real, cualquiera que haya leído el repo puede firmar tokens.
const PLACEHOLDER_SECRETS = new Set([
  'default-secret',
  'changeme-use-a-long-random-string',
  'your-super-secret-jwt-key-change-in-production',
]);

/**
 * Devuelve `JWT_SECRET` o corta el arranque.
 *
 * Antes había un fallback a `'default-secret'`: si la variable faltaba, el
 * backend levantaba igual y firmaba con un secreto público, o sea que cualquiera
 * podía fabricar el token de un ADMIN. Preferimos que el contenedor no arranque.
 */
export function getJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET no está definido: el backend no puede arrancar sin él');
  }
  if (process.env.NODE_ENV === 'production' && PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET usa un valor de ejemplo: generá uno aleatorio para producción');
  }
  return secret;
}
