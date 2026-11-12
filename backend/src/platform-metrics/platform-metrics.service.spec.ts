import { DocumentStatus, LoadStatus, Role, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformMetricsService } from './platform-metrics.service';

const now = new Date(2026, 9, 15, 12, 0);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

function makePrisma() {
  return {
    user: {
      groupBy: jest.fn().mockResolvedValue([
        { role: Role.TRANSPORTER, _count: { _all: 7 } },
        { role: Role.CARGO_GENERATOR, _count: { _all: 3 } },
      ]),
      findMany: jest
        .fn()
        // altas
        .mockResolvedValueOnce([{ role: Role.TRANSPORTER, createdAt: hoursAgo(24) }])
        // vencimientos
        .mockResolvedValueOnce([
          {
            id: 'u1',
            firstName: 'Ana',
            lastName: 'Gómez',
            licenseExpiresAt: hoursAgo(-48),
            vehicle: null,
          },
        ]),
    },
    load: {
      findMany: jest
        .fn()
        // cargas de la ventana
        .mockResolvedValueOnce([
          {
            id: 'l1',
            title: 'Soja a Rosario',
            status: LoadStatus.PUBLISHED,
            createdAt: hoursAgo(72),
            shipper: { firstName: 'Juan', lastName: 'Pérez', companyName: 'Agro SA' },
            trip: null,
            postulations: [],
          },
        ])
        // dadores activos
        .mockResolvedValueOnce([{ shipperId: 'sh1' }]),
      count: jest.fn().mockResolvedValue(4),
    },
    trip: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          {
            status: TripStatus.COMPLETED,
            createdAt: hoursAgo(100),
            startedAt: hoursAgo(50),
            completedAt: hoursAgo(26),
            distanceKm: 100,
            fuelLiters: 30,
            load: { deliveryDate: hoursAgo(20), price: 50000, postulations: [{ proposedPrice: 60000 }] },
          },
        ])
        // transportistas con viajes recientes
        .mockResolvedValueOnce([{ carrierId: 't1' }, { carrierId: 't2' }]),
      count: jest.fn().mockResolvedValue(2),
    },
    postulation: {
      findMany: jest.fn().mockResolvedValue([{ transporterId: 't1' }]),
    },
    document: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ status: DocumentStatus.PENDING, createdAt: hoursAgo(60), reviewedAt: null }])
        .mockResolvedValueOnce([]),
    },
    rating: {
      aggregate: jest.fn().mockResolvedValue({ _avg: { score: 4.26 }, _count: { _all: 9 } }),
    },
  };
}

describe('PlatformMetricsService', () => {
  it('assembles every section of the admin metrics from the database', async () => {
    const prisma = makePrisma();
    const service = new PlatformMetricsService(prisma as unknown as PrismaService);

    const result = await service.getMetrics(now);

    expect(result.users).toMatchObject({
      byRole: { TRANSPORTER: 7, CARGO_GENERATOR: 3 },
      total: 10,
      // t1 se postuló y además tiene viaje: cuenta una vez
      activeLast30Days: { shippers: 1, transporters: 2 },
    });
    expect(result.now).toEqual({ loadsOpen: 4, tripsInProgress: 2 });
    expect(result.marketplace.unansweredLoads).toEqual([
      expect.objectContaining({ title: 'Soja a Rosario', shipperName: 'Agro SA', hoursWaiting: 72 }),
    ]);
    expect(result.trips.volumeThisMonth).toBe(60000);
    expect(result.verification.stalePendingDocuments).toBe(1);
    expect(result.expiryAlerts).toEqual([
      expect.objectContaining({ userName: 'Ana Gómez', kind: 'LICENSE', daysLeft: 2 }),
    ]);
    expect(result.ratings).toEqual({ average: 4.3, count: 9 });
  });

  it('counts in-progress trips in the database instead of from a capped page', async () => {
    const prisma = makePrisma();
    await new PlatformMetricsService(prisma as unknown as PrismaService).getMetrics(now);
    expect(prisma.trip.count).toHaveBeenCalledWith({ where: { status: TripStatus.IN_PROGRESS } });
  });
});
