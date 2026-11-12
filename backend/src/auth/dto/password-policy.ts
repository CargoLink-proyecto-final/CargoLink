/**
 * Política de contraseñas para claves NUEVAS (registro y reset).
 *
 * El mínimo subió de 6 a 8 (lo que pide NIST SP 800-63B). El login no aplica
 * este mínimo para no dejar afuera a cuentas creadas con la regla anterior.
 * El máximo es 72 porque bcrypt ignora en silencio todo lo que pase de 72 bytes:
 * dos claves que solo difieren después de ese punto serían la misma.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
