import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { getJwtSecret } from './jwt-secret';
import { SocketAuthService } from './socket-auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Storage en memoria del rate limit. No hay guard global: se aplica solo donde
    // se usa ClientIpThrottlerGuard (hoy, AuthController), para no frenar el
    // tracking GPS ni el resto de la API. Con una sola réplica del backend la
    // memoria alcanza; con varias habría que pasar a un storage compartido.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: getJwtSecret(configService),
        signOptions: {
          // Access token corto: si se filtra, sirve por minutos. La sesión larga
          // la sostiene el refresh token (rotativo y revocable, ver
          // RefreshTokenService). Variable nueva a propósito: los .env de los
          // entornos tienen JWT_EXPIRATION=7d y no queremos heredarlo.
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SocketAuthService, RefreshTokenService],
  exports: [AuthService, SocketAuthService],
})
export class AuthModule {}
