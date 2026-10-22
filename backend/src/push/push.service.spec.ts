import { Test, TestingModule } from '@nestjs/testing';
import { PushService, isExpoPushToken } from './push.service';
import { PresenceService } from './presence.service';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN = 'ExponentPushToken[abc123]';

describe('isExpoPushToken', () => {
  it.each([
    'ExponentPushToken[abc123]',
    'ExpoPushToken[abc123]',
  ])('accepts %s', (token) => {
    expect(isExpoPushToken(token)).toBe(true);
  });

  it.each([
    '',
    'abc123',
    'ExponentPushToken[]',
    'ExponentPushToken abc123',
    'null',
  ])('rejects %p', (token) => {
    expect(isExpoPushToken(token)).toBe(false);
  });
});

describe('PushService', () => {
  let service: PushService;
  let presence: PresenceService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let fetchMock: jest.Mock;

  const okResponse = (body: unknown = { data: { status: 'ok' } }) => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ expoPushToken: TOKEN }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // `registerToken` manda las dos escrituras juntas: desasociar al dueño
      // anterior y asignar al nuevo. El mock resuelve el array como lo haría
      // Prisma, así los asserts siguen mirando los mismos jest.fn().
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        PresenceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PushService);
    presence = module.get(PresenceService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('registerToken', () => {
    it('saves the token on the user', async () => {
      await service.registerToken('u1', TOKEN);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { expoPushToken: TOKEN },
      });
    });

    it('detaches the token from whoever had it before', async () => {
      // Mismo teléfono, otra sesión: si no se limpia, el dueño anterior recibe
      // las notificaciones del nuevo usuario.
      await service.registerToken('u1', TOKEN);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { expoPushToken: TOKEN, NOT: { id: 'u1' } },
        data: { expoPushToken: null },
      });
    });

    // Si las dos escrituras fueran sueltas y la segunda fallara, el dueño
    // anterior quedaría sin token y el nuevo tampoco lo tendría: nadie
    // recibiría las notificaciones de ese teléfono hasta el próximo login.
    it('applies both writes atomically', async () => {
      await service.registerToken('u1', TOKEN);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    });
  });

  it('clearToken wipes the stored token', async () => {
    await service.clearToken('u1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { expoPushToken: null },
    });
  });

  describe('notify', () => {
    it('sends the notification to the stored token', async () => {
      await service.notify('u1', { title: 'Ana', body: 'Hola', data: { tripId: 't1' } });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://exp.host/--/api/v2/push/send');
      expect(JSON.parse(init.body)).toMatchObject({
        to: TOKEN,
        title: 'Ana',
        body: 'Hola',
        data: { tripId: 't1' },
      });
    });

    it('stays quiet when the user has the app open', async () => {
      // El cliente ya muestra una notificación local desde el socket: mandar
      // push además se la duplicaría.
      presence.connect('u1');

      await service.notify('u1', { title: 'Ana', body: 'Hola' });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('sends again once every socket of that user is gone', async () => {
      presence.connect('u1');
      presence.disconnect('u1');

      await service.notify('u1', { title: 'Ana', body: 'Hola' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the user never registered a device', async () => {
      prisma.user.findUnique.mockResolvedValue({ expoPushToken: null });

      await service.notify('u1', { title: 'Ana', body: 'Hola' });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('drops a token Expo reports as unregistered', async () => {
      // Expo contesta 200 con el error adentro; sin esto reintentaríamos contra
      // un dispositivo que desinstaló la app en cada mensaje.
      fetchMock.mockResolvedValue(
        okResponse({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }),
      );

      await service.notify('u1', { title: 'Ana', body: 'Hola' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { expoPushToken: null },
      });
    });

    it('keeps the token for errors that are not about the device', async () => {
      fetchMock.mockResolvedValue(
        okResponse({ data: { status: 'error', details: { error: 'MessageRateExceeded' } } }),
      );

      await service.notify('u1', { title: 'Ana', body: 'Hola' });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('swallows a non-200 from Expo', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 502, json: jest.fn() });

      await expect(service.notify('u1', { title: 'Ana', body: 'Hola' })).resolves.toBeUndefined();
    });

    it('swallows a network failure so sending a message never breaks', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.notify('u1', { title: 'Ana', body: 'Hola' })).resolves.toBeUndefined();
    });
  });
});
