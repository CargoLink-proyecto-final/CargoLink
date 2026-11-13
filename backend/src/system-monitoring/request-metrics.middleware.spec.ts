import { Controller, Get, INestApplication, InternalServerErrorException, MiddlewareConsumer, Module, NestModule, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequestMetricsMiddleware, UNMATCHED_ROUTE } from './request-metrics.middleware';
import { RequestMetricsRecorder } from './request-metrics.recorder';

@Controller('loads')
class FakeLoadsController {
  @Get(':id')
  findOne(@Param('id') id: string) {
    return { id };
  }

  @Get(':id/boom')
  boom() {
    throw new InternalServerErrorException();
  }
}

@Module({
  controllers: [FakeLoadsController],
  providers: [RequestMetricsRecorder],
})
class FakeAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestMetricsMiddleware).forRoutes('*');
  }
}

// Integración real con Express: la etiqueta de ruta depende de cómo Nest
// registra los handlers, algo que un mock de `req` no prueba.
describe('RequestMetricsMiddleware (with a real Nest app)', () => {
  let app: INestApplication;
  let recorder: RequestMetricsRecorder;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [FakeAppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
    recorder = app.get(RequestMetricsRecorder);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    recorder.drain(new Date(), true);
  });

  // `finish` se emite después de mandar la respuesta: esperar un tick.
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('records the route template, never the real id', async () => {
    await fetch(`${baseUrl}/api/loads/8f3a-secret-id?x=1`);
    await settle();

    const rows = recorder.drain(new Date(), true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'GET', route: '/api/loads/:id', count: 1, serverErrors: 0 });
  });

  it('counts 5xx responses as server errors', async () => {
    await fetch(`${baseUrl}/api/loads/1/boom`);
    await settle();

    const [row] = recorder.drain(new Date(), true);
    expect(row).toMatchObject({ route: '/api/loads/:id/boom', serverErrors: 1, clientErrors: 0 });
  });

  it('groups requests to unknown API paths under a single label', async () => {
    await fetch(`${baseUrl}/api/nope/123`);
    await fetch(`${baseUrl}/api/other/456`);
    await settle();

    const rows = recorder.drain(new Date(), true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ route: UNMATCHED_ROUTE, count: 2, clientErrors: 2 });
  });

  it('does not measure paths outside the API prefix (bot scans)', async () => {
    await fetch(`${baseUrl}/wp-admin/install.php`);
    await settle();

    expect(recorder.drain(new Date(), true)).toEqual([]);
  });

  it('skips CORS preflight requests', async () => {
    await fetch(`${baseUrl}/api/loads/1`, { method: 'OPTIONS' });
    await settle();

    expect(recorder.drain(new Date(), true)).toEqual([]);
  });
});
