import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { Test } from '@nestjs/testing';
import { TripStatus } from '@prisma/client';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';
import { fetchRouteDistanceKm } from '../common/routing';

// Integración TripsService ↔ OSRM por HTTP real. En vez del servidor público
// (rate limit, sin SLA) se levanta un OSRM falso local y se apunta OSRM_URL a
// él. Prisma sí va mockeado: lo que se prueba es la frontera con OSRM.

type Behavior = 'ok' | 'error' | 'hang';

describe('TripsService + OSRM (integración)', () => {
  let server: Server;
  let behavior: Behavior = 'ok';
  let service: TripsService;
  let prisma: {
    trip: { findUnique: jest.Mock; update: jest.Mock };
    load: { update: jest.Mock };
    $transaction: jest.Mock;
  };

  const trip = {
    id: 'trip-1',
    loadId: 'load-1',
    carrierId: 'carrier-1',
    status: TripStatus.IN_PROGRESS,
    load: { originLat: -34.6, originLng: -58.4, destLat: -31.4, destLng: -64.2 },
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (behavior === 'hang') return; // acepta la conexión y nunca responde
      if (behavior === 'error') {
        res.writeHead(503).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 702400 }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    process.env.OSRM_URL = `http://127.0.0.1:${port}`;
    process.env.OSRM_TIMEOUT_MS = '300';
  });

  afterAll(async () => {
    delete process.env.OSRM_URL;
    delete process.env.OSRM_TIMEOUT_MS;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    behavior = 'ok';
    prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue(trip),
        update: jest.fn((args) => args),
      },
      load: { update: jest.fn((args) => args) },
      $transaction: jest.fn(async (ops) => ops),
    };
    const module = await Test.createTestingModule({
      providers: [TripsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TripsService);
  });

  const storedDistance = () =>
    prisma.trip.update.mock.calls[0][0].data.distanceKm as number | null;

  it('stores the OSRM route distance when the service answers', async () => {
    await service.completeTrip(trip.id, trip.carrierId, 80);

    expect(storedDistance()).toBe(702.4);
  });

  it('completes the trip with null distance when OSRM returns an error', async () => {
    behavior = 'error';

    await service.completeTrip(trip.id, trip.carrierId, 80);

    expect(storedDistance()).toBeNull();
  });

  // Defecto #155: sin timeout, un OSRM que acepta la conexión y no responde
  // dejaba colgado el cierre del viaje.
  it('completes the trip with null distance when OSRM never answers', async () => {
    behavior = 'hang';
    const started = Date.now();

    await service.completeTrip(trip.id, trip.carrierId, 80);

    expect(storedDistance()).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('aborts the OSRM request once the timeout elapses', async () => {
    behavior = 'hang';

    await expect(fetchRouteDistanceKm(1, 2, 3, 4)).resolves.toBeNull();
  });
});
