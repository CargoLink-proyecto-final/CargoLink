import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from './token-crypto';

describe('RefreshTokenService', () => {
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: RefreshTokenService;

  const user = {
    id: 'user-1',
    email: 'a@b.com',
    firstName: 'Ana',
    lastName: 'B',
    role: Role.TRANSPORTER,
    isActive: true,
  };
  const stored = (overrides: Record<string, unknown> = {}) => ({
    id: 'rt-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: hashToken('old-token'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    user,
    ...overrides,
  });

  const config = (ttl?: string) =>
    ({ get: jest.fn(() => ttl) }) as unknown as ConfigService;

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-2' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // El callback recibe el mismo doble como cliente transaccional.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new RefreshTokenService(prisma as unknown as PrismaService, config());
  });

  describe('issue', () => {
    it('stores only the hash and returns the plain token', async () => {
      const token = await service.issue('user-1');

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(hashToken(token));
      expect(data.tokenHash).not.toBe(token);
      expect(data.userId).toBe('user-1');
      expect(data.familyId).toEqual(expect.any(String));
    });

    it('expires after 30 days by default', async () => {
      await service.issue('user-1');
      const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data;
      const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
    });

    it('honours REFRESH_TOKEN_TTL_DAYS', async () => {
      service = new RefreshTokenService(prisma as unknown as PrismaService, config('7'));
      await service.issue('user-1');
      const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(Math.round((expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(7);
    });

    it('opens a new family on every login', async () => {
      await service.issue('user-1');
      await service.issue('user-1');
      const [a, b] = prisma.refreshToken.create.mock.calls.map((c) => c[0].data.familyId);
      expect(a).not.toBe(b);
    });
  });

  describe('rotate', () => {
    it('revokes the used token and issues the next one in the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());

      const result = await service.rotate('old-token');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken('old-token') } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      const created = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(created.familyId).toBe('family-1');
      expect(created.tokenHash).toBe(hashToken(result.refreshToken));
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { replacedById: 'rt-2' },
      });
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Ana',
        lastName: 'B',
        role: Role.TRANSPORTER,
      });
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotate('nope')).rejects.toThrow(UnauthorizedException);
    });

    // Reuso = alguien tiene una copia vieja del token. Se corta la sesión entera
    // para que el ladrón tampoco pueda seguir usando el token que ya rotó.
    it('revokes the whole family when a revoked token is reused', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date() }));

      await expect(service.rotate('old-token')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        stored({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.rotate('old-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a deactivated user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        stored({ user: { ...user, isActive: false } }),
      );
      await expect(service.rotate('old-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('treats losing a concurrent rotation race as reuse', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());
      prisma.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 }) // otra request ya lo canjeó
        .mockResolvedValue({ count: 1 });

      await expect(service.rotate('old-token')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('revoke', () => {
    it('revokes the family of the token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ familyId: 'family-1' });
      await service.revoke('old-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is a no-op for an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.revoke('nope')).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  it('revokeAllForUser closes every open session of the user', async () => {
    await service.revokeAllForUser('user-1');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
