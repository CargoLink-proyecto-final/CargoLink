import { PrismaService } from '../prisma/prisma.service';
import { emptyHistogram } from './latency-histogram';
import { RequestMetricsRecorder } from './request-metrics.recorder';
import { UptimeService } from './uptime.service';

function makePrisma() {
  return {
    uptimeSession: {
      create: jest.fn().mockResolvedValue({ id: 's1', startedAt: new Date('2026-10-15T10:00:00Z') }),
      update: jest.fn().mockResolvedValue({}),
    },
    requestMetric: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('UptimeService', () => {
  const at = (iso: string) => new Date(`2026-10-15T${iso}Z`);
  let prisma: ReturnType<typeof makePrisma>;
  let recorder: RequestMetricsRecorder;
  let service: UptimeService;

  beforeEach(() => {
    jest.useFakeTimers();
    prisma = makePrisma();
    recorder = new RequestMetricsRecorder();
    service = new UptimeService(prisma as unknown as PrismaService, recorder);
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('opens a session on boot', async () => {
    await service.onApplicationBootstrap();
    expect(prisma.uptimeSession.create).toHaveBeenCalledTimes(1);
    expect(service.heartbeatStatus().sessionId).toBe('s1');
  });

  it('still boots when the database is unreachable, and opens the session on a later tick', async () => {
    prisma.uptimeSession.create.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await service.onApplicationBootstrap();
    expect(service.heartbeatStatus().sessionId).toBeNull();

    await service.tick(at('10:01:00'));
    expect(service.heartbeatStatus().sessionId).toBe('s1');
  });

  it('updates lastSeenAt on every tick and flushes closed minutes', async () => {
    await service.onApplicationBootstrap();
    recorder.record('GET', '/api/loads', 200, 30, at('10:00:10'));

    await service.tick(at('10:01:00'));

    expect(prisma.uptimeSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { lastSeenAt: at('10:01:00') },
    });
    expect(prisma.requestMetric.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ route: '/api/loads', count: 1 })],
      skipDuplicates: true,
    });
  });

  it('counts consecutive heartbeat failures and resets them on success', async () => {
    await service.onApplicationBootstrap();
    prisma.uptimeSession.update.mockRejectedValueOnce(new Error('db down')).mockRejectedValueOnce(new Error('db down'));

    await service.tick(at('10:01:00'));
    await service.tick(at('10:02:00'));
    expect(service.heartbeatStatus().consecutiveFailures).toBe(2);

    await service.tick(at('10:03:00'));
    expect(service.heartbeatStatus().consecutiveFailures).toBe(0);
  });

  it('keeps unflushed metrics in memory while the heartbeat fails', async () => {
    await service.onApplicationBootstrap();
    recorder.record('GET', '/api/loads', 200, 30, at('10:00:10'));
    prisma.uptimeSession.update.mockRejectedValueOnce(new Error('db down'));

    await service.tick(at('10:01:00'));
    expect(prisma.requestMetric.createMany).not.toHaveBeenCalled();
    expect(recorder.pendingStats().count).toBe(1);
  });

  it('merges into an existing minute instead of overwriting it (restart within the same minute)', async () => {
    await service.onApplicationBootstrap();
    const histogram = emptyHistogram();
    histogram[0] = 4;
    prisma.requestMetric.findMany.mockResolvedValueOnce([
      {
        id: 'm1',
        bucket: at('10:00:00'),
        method: 'GET',
        route: '/api/loads',
        count: 4,
        clientErrors: 1,
        serverErrors: 0,
        totalMs: 40,
        maxMs: 10,
        histogram,
      },
    ]);
    recorder.record('GET', '/api/loads', 500, 8, at('10:00:30'));

    await service.tick(at('10:01:00'));

    expect(prisma.requestMetric.createMany).not.toHaveBeenCalled();
    expect(prisma.requestMetric.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({ count: 5, clientErrors: 1, serverErrors: 1, totalMs: 48, maxMs: 10 }),
    });
  });

  it('marks the session as ended and saves the minute in progress on graceful shutdown', async () => {
    await service.onApplicationBootstrap();
    recorder.record('GET', '/api/loads', 200, 30);

    await service.onApplicationShutdown();

    expect(prisma.requestMetric.createMany).toHaveBeenCalled();
    const lastUpdate = prisma.uptimeSession.update.mock.calls.at(-1)[0];
    expect(lastUpdate.where).toEqual({ id: 's1' });
    expect(lastUpdate.data.endedAt).toBeInstanceOf(Date);
  });

  it('prunes old request metrics at most once an hour', async () => {
    await service.onApplicationBootstrap();
    await service.tick(at('10:01:00'));
    await service.tick(at('10:02:00'));
    expect(prisma.requestMetric.deleteMany).toHaveBeenCalledTimes(1);

    await service.tick(at('11:02:00'));
    expect(prisma.requestMetric.deleteMany).toHaveBeenCalledTimes(2);
  });
});
