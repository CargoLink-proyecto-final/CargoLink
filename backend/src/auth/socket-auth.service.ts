import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';

export interface SocketUser {
  id: string;
  role: string;
}

/**
 * Valida el access token con el que se conecta un socket.
 *
 * Es el equivalente de `JwtStrategy` para WebSockets: Passport no corre en el
 * handshake de Socket.IO, así que la verificación se hace a mano con el mismo
 * secreto y el mismo criterio (usuario existente y activo, rol leído de la DB).
 */
@Injectable()
export class SocketAuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {}

  async authenticate(token: string | undefined | null): Promise<SocketUser | null> {
    if (!token) return null;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.usersService.findById(payload.sub);
      if (!user.isActive) return null;
      return { id: user.id, role: user.role };
    } catch {
      // Firma inválida, token vencido o usuario inexistente: mismo resultado.
      return null;
    }
  }
}

/**
 * El cliente manda el token en `auth.token` (Socket.IO v4); aceptamos también el
 * header `Authorization: Bearer` para clientes que no puedan usar `auth`.
 */
export function extractSocketToken(handshake: {
  auth?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const fromAuth = handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
  const header = handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return null;
}
