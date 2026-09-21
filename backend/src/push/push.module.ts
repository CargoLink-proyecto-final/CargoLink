import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PresenceService } from './presence.service';

/**
 * Global como `PrismaModule`: el gateway de chat marca presencia, los servicios
 * de dominio notifican, y `UsersModule` registra el token. Exportarlo evita
 * importarlo en cada módulo que quiera avisar algo.
 *
 * `PresenceService` guarda estado en memoria, así que tiene que ser un único
 * singleton — registrarlo en varios módulos daría contadores separados y el
 * gateway marcaría presencia en una instancia distinta de la que consulta
 * `PushService`.
 */
@Global()
@Module({
  providers: [PushService, PresenceService],
  exports: [PushService, PresenceService],
})
export class PushModule {}
