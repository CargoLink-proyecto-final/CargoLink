import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MessagesModule } from './messages.module';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { ChatBroadcaster } from './chat-broadcaster';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { PresenceService } from '../push/presence.service';

/**
 * Doble de los módulos globales de la app (`PrismaModule`, `PushModule`), para
 * compilar `MessagesModule` sin base ni red.
 */
@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: {} },
    { provide: PushService, useValue: { notify: jest.fn() } },
    { provide: PresenceService, useValue: { connect: jest.fn(), disconnect: jest.fn() } },
  ],
  exports: [PrismaService, PushService, PresenceService],
})
class GlobalDoublesModule {}

/**
 * Compila el módulo de chat de verdad, con el contenedor de Nest resolviendo el
 * grafo completo.
 *
 * Existe porque la primera versión de este arreglo inyectaba el gateway en el
 * service con `forwardRef` y la resolución se iba en recursión infinita: los
 * tests unitarios, que usan mocks, pasaban igual y el error habría aparecido
 * recién al levantar la app. Si alguien vuelve a cerrar el ciclo, esto lo corta.
 */
describe('MessagesModule (wiring)', () => {
  it('instantiates the whole chat graph without circular resolution', async () => {
    // El gateway valida tokens con AuthModule, que exige JWT_SECRET y usa el
    // ConfigModule global (en la app lo registra AppModule).
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        GlobalDoublesModule,
        MessagesModule,
      ],
    }).compile();

    const service = moduleRef.get(MessagesService);
    const gateway = moduleRef.get(MessagesGateway);
    const broadcaster = moduleRef.get(ChatBroadcaster);

    expect(service).toBeInstanceOf(MessagesService);
    expect(gateway).toBeInstanceOf(MessagesGateway);
    // El mismo singleton de los dos lados: si fueran instancias distintas, el
    // service emitiría contra un broadcaster sin servidor registrado.
    expect(service['broadcaster']).toBe(broadcaster);
    expect(gateway['broadcaster']).toBe(broadcaster);
  });
});
