import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateOpaqueToken, hashToken } from './token-crypto';

const DEFAULT_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RefreshedSession {
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
  };
}

/**
 * Refresh tokens rotativos con detección de reuso.
 *
 * Cada login abre una familia (una sesión). Cada `rotate` revoca el token
 * usado y emite el siguiente en la misma familia. Si se presenta un token ya
 * revocado, alguien tiene una copia vieja (robo, o el cliente legítimo y un
 * atacante compitiendo): se revoca la familia entera y ambos tienen que volver
 * a loguearse. Es el esquema que recomienda OWASP para tokens de larga vida.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly ttlMs: number;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    const days = Number(config.get<string>('REFRESH_TOKEN_TTL_DAYS'));
    this.ttlMs = (Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS) * DAY_MS;
  }

  /** Abre una sesión nueva (familia nueva) para el usuario. */
  async issue(userId: string): Promise<string> {
    return this.create(userId, randomUUID());
  }

  /**
   * Canjea un refresh token por el siguiente de su familia.
   * Tira 401 si el token no existe, venció, ya fue usado o el usuario está inactivo.
   */
  async rotate(token: string): Promise<RefreshedSession> {
    const invalid = new UnauthorizedException('Sesión vencida. Iniciá sesión de nuevo.');
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
    if (!current) throw invalid;

    if (current.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${current.userId}; revoking session ${current.familyId}`,
      );
      await this.revokeFamily(current.familyId);
      throw invalid;
    }
    if (current.expiresAt <= new Date() || !current.user.isActive) {
      await this.revokeFamily(current.familyId);
      throw invalid;
    }

    const next = generateOpaqueToken(48);
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Revocación condicional: si dos requests canjean el mismo token a la vez,
      // solo una gana. La otra cuenta como reuso.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      const created = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: next.tokenHash,
          expiresAt: new Date(Date.now() + this.ttlMs),
        },
      });
      await tx.refreshToken.update({
        where: { id: current.id },
        data: { replacedById: created.id },
      });
      return created;
    });

    if (!rotated) {
      await this.revokeFamily(current.familyId);
      throw invalid;
    }

    const { isActive: _isActive, ...user } = current.user;
    return { refreshToken: next.token, user };
  }

  /** Logout: cierra la sesión a la que pertenece el token. Silencioso si no existe. */
  async revoke(token: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { familyId: true },
    });
    if (current) await this.revokeFamily(current.familyId);
  }

  /** Cierra todas las sesiones del usuario (ej. después de resetear la contraseña). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async create(userId: string, familyId: string): Promise<string> {
    const { token, tokenHash } = generateOpaqueToken(48);
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash, expiresAt: new Date(Date.now() + this.ttlMs) },
    });
    return token;
  }
}
