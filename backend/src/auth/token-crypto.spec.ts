import { getRounds, hashSync } from 'bcrypt';
import {
  BCRYPT_ROUNDS,
  DUMMY_PASSWORD_HASH,
  generateOpaqueToken,
  hashToken,
  needsRehash,
} from './token-crypto';

describe('token-crypto', () => {
  // Si el dummy y los hashes reales tienen costos distintos, el login de un email
  // inexistente tarda distinto que el de uno registrado y delata qué cuentas
  // existen. Este test frena que alguien suba BCRYPT_ROUNDS sin regenerar el dummy.
  it('uses a dummy hash with the same cost as real password hashes', () => {
    expect(getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_ROUNDS);
  });

  describe('needsRehash', () => {
    it('flags hashes with a lower cost than the current one', () => {
      expect(needsRehash(hashSync('x', 10))).toBe(true);
    });

    it('accepts hashes with the current cost', () => {
      expect(needsRehash(DUMMY_PASSWORD_HASH)).toBe(false);
    });

    it('does not throw on something that is not a bcrypt hash', () => {
      expect(needsRehash('not-a-hash')).toBe(false);
    });
  });

  it('generates opaque tokens whose stored value is their SHA-256', () => {
    const { token, tokenHash } = generateOpaqueToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toBe(token);
  });
});
