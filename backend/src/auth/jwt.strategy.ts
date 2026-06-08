import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'default-secret'),
    });
  }

  // Resolvemos el usuario desde la DB en cada request (no confiamos en el payload):
  // así una desactivación corta las sesiones vivas al instante y un cambio de rol
  // aplica los permisos nuevos sin esperar a que el token expire (TTL 7d).
  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub).catch(() => null);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Cuenta inactiva o inexistente');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
