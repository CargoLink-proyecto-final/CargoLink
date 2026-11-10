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
          expiresIn: configService.get<string>('JWT_EXPIRATION', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SocketAuthService],
  exports: [AuthService, SocketAuthService],
})
export class AuthModule {}
