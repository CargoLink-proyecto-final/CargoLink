import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TripStatus, LoadStatus } from '@prisma/client';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';
import { fetchRouteDistanceKm } from '../common/routing';

// La distancia se obtiene de OSRM (network). La mockeamos por completo para no
// salir a la red; las métricas (computeFuelAndDeliveryMetrics) son una función
// pura, así que la dejamos correr de verdad y verificamos los números reales.
jest.mock('../common/routing', () => ({
  fetchRouteDistanceKm: jest.fn(),
}));

const mockedFetchRouteDistanceKm = fetchRouteDistanceKm as jest.Mock;

describe('TripsService', () => {
  let service: TripsService;
  let prisma: {
    load: { findUnique: jest.Mock; update: jest.Mock };
    trip: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const CARRIER_ID = 'carrier-1';
  const LOAD_ID = 'load-1';
  const TRIP_ID = 'trip-1';

  const baseLoad = {
    id: LOAD_ID,
    status: LoadStatus.PUBLISHED,
    originLat: -34.6,
    originLng: -58.4,
    destLat: -31.4,
    destLng: -64.2,
  };

  const baseTrip = {
    id: TRIP_ID,
    loadId: LOAD_ID,
    carrierId: CARRIER_ID,
    status: TripStatus.ACCEPTED,
    load: baseLoad,
  };

  beforeEach(async () => {
    prisma = {
      load: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      trip: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      // $transaction soporta dos formas: callback (acceptLoad) o array
      // (start/complete). Implementamos ambas.
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
    mockedFetchRouteDistanceKm.mockResolvedValue(123.4);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('acceptLoad', () => {
    it('throws NotFoundException when the load does not exist', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await expect(service.acceptLoad(CARRIER_ID, LOAD_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the load is not PUBLISHED', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        status: LoadStatus.ASSIGNED,
      });
      await expect(service.acceptLoad(CARRIER_ID, LOAD_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('marks the load ASSIGNED and creates an ACCEPTED trip in a transaction', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      const tx = {
        load: { update: jest.fn().mockResolvedValue(undefined) },
        trip: { create: jest.fn().mockResolvedValue({ ...baseTrip }) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const result = await service.acceptLoad(CARRIER_ID, LOAD_ID);

      expect(tx.load.update).toHaveBeenCalledWith({
        where: { id: LOAD_ID },
        data: { status: LoadStatus.ASSIGNED },
      });
      expect(tx.trip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            loadId: LOAD_ID,
            carrierId: CARRIER_ID,
            status: TripStatus.ACCEPTED,
          },
        }),
      );
      expect(result.status).toBe(TripStatus.ACCEPTED);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.trip.findMany.mockResolvedValue([baseTrip]);
      prisma.trip.count.mockResolvedValue(1);
      prisma.$transaction.mockImplementation((arr: any) => Promise.all(arr));
    });

    it('uses default pagination (page 1, limit 20) when no params given', async () => {
      const result = await service.findAll();
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, where: {} }),
      );
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
      expect(result.trips).toEqual([baseTrip]);
    });

    it('computes skip from page/limit and totalPages from total', async () => {
      prisma.trip.count.mockResolvedValue(45);
      const result = await service.findAll({ page: 3, limit: 10 });
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.totalPages).toBe(5);
    });

    it('filters by carrierId', async () => {
      await service.findAll({ carrierId: CARRIER_ID });
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { carrierId: CARRIER_ID } }),
      );
    });

    it('filters by shipperId via nested load relation', async () => {
      await service.findAll({ shipperId: 'shipper-9' });
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { load: { shipperId: 'shipper-9' } } }),
      );
    });

    it('filters by status', async () => {
      await service.findAll({ status: TripStatus.IN_PROGRESS });
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: TripStatus.IN_PROGRESS } }),
      );
    });

    it('combines multiple filters into a single where clause', async () => {
      await service.findAll({
        carrierId: CARRIER_ID,
        shipperId: 'shipper-9',
        status: TripStatus.COMPLETED,
      });
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            carrierId: CARRIER_ID,
            load: { shipperId: 'shipper-9' },
            status: TripStatus.COMPLETED,
          },
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns the trip when found', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      const result = await service.findById(TRIP_ID);
      expect(result).toBe(baseTrip);
      expect(prisma.trip.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TRIP_ID } }),
      );
    });

    it('throws NotFoundException when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(service.findById(TRIP_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // #161: el detalle del viaje expone teléfonos y ubicación, así que solo lo
  // ven las partes del viaje y el ADMIN.
  describe('findByIdForUser', () => {
    const SHIPPER_ID = 'shipper-1';
    const tripWithShipper = { ...baseTrip, load: { ...baseLoad, shipperId: SHIPPER_ID } };

    it('returns the trip to the shipper who owns the load', async () => {
      // Arrange
      prisma.trip.findUnique.mockResolvedValue(tripWithShipper);
      // Act
      const result = await service.findByIdForUser(TRIP_ID, { id: SHIPPER_ID, role: 'CARGO_GENERATOR' });
      // Assert
      expect(result).toBe(tripWithShipper);
    });

    it('returns the trip to the assigned carrier', async () => {
      // Arrange
      prisma.trip.findUnique.mockResolvedValue(tripWithShipper);
      // Act
      const result = await service.findByIdForUser(TRIP_ID, { id: CARRIER_ID, role: 'TRANSPORTER' });
      // Assert
      expect(result).toBe(tripWithShipper);
    });

    it('returns any trip to an ADMIN', async () => {
      // Arrange
      prisma.trip.findUnique.mockResolvedValue(tripWithShipper);
      // Act
      const result = await service.findByIdForUser(TRIP_ID, { id: 'admin-1', role: 'ADMIN' });
      // Assert
      expect(result).toBe(tripWithShipper);
    });

    it.each([
      ['another carrier', { id: 'carrier-2', role: 'TRANSPORTER' }],
      ['another shipper', { id: 'shipper-2', role: 'CARGO_GENERATOR' }],
    ])('throws ForbiddenException to %s', async (_label, user) => {
      // Arrange
      prisma.trip.findUnique.mockResolvedValue(tripWithShipper);
      // Act
      const result = service.findByIdForUser(TRIP_ID, user);
      // Assert
      await expect(result).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the trip does not exist', async () => {
      // Arrange
      prisma.trip.findUnique.mockResolvedValue(null);
      // Act
      const result = service.findByIdForUser(TRIP_ID, { id: 'admin-1', role: 'ADMIN' });
      // Assert
      await expect(result).rejects.toThrow(NotFoundException);
    });
  });

  describe('startTrip', () => {
    it('throws ForbiddenException when the trip belongs to another carrier', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        ...baseTrip,
        carrierId: 'other-carrier',
      });
      await expect(service.startTrip(TRIP_ID, CARRIER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the trip is not ACCEPTED', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        ...baseTrip,
        status: TripStatus.IN_PROGRESS,
      });
      await expect(service.startTrip(TRIP_ID, CARRIER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sets trip IN_PROGRESS + load IN_TRANSIT in a transaction', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.trip.update.mockReturnValue('trip-update-op');
      prisma.load.update.mockReturnValue('load-update-op');
      prisma.$transaction.mockResolvedValue(['updated-trip', 'updated-load']);

      const result = await service.startTrip(TRIP_ID, CARRIER_ID);

      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRIP_ID },
          data: expect.objectContaining({
            status: TripStatus.IN_PROGRESS,
            startedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: LOAD_ID },
        data: { status: LoadStatus.IN_TRANSIT },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        'trip-update-op',
        'load-update-op',
      ]);
      expect(result).toEqual(['updated-trip', 'updated-load']);
    });
  });

  describe('completeTrip', () => {
    const inProgressTrip = { ...baseTrip, status: TripStatus.IN_PROGRESS };

    beforeEach(() => {
      prisma.trip.update.mockReturnValue('trip-update-op');
      prisma.load.update.mockReturnValue('load-update-op');
      prisma.$transaction.mockResolvedValue(['updated-trip', 'updated-load']);
    });

    it('throws ForbiddenException when the trip belongs to another carrier', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        ...inProgressTrip,
        carrierId: 'other-carrier',
      });
      await expect(service.completeTrip(TRIP_ID, CARRIER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the trip is not IN_PROGRESS', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip); // ACCEPTED
      await expect(service.completeTrip(TRIP_ID, CARRIER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('fetches OSRM distance and stores it with the provided fuelLiters', async () => {
      prisma.trip.findUnique.mockResolvedValue(inProgressTrip);
      mockedFetchRouteDistanceKm.mockResolvedValue(250.5);

      await service.completeTrip(TRIP_ID, CARRIER_ID, 90.5);

      expect(mockedFetchRouteDistanceKm).toHaveBeenCalledWith(
        baseLoad.originLat,
        baseLoad.originLng,
        baseLoad.destLat,
        baseLoad.destLng,
      );
      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TRIP_ID },
          data: expect.objectContaining({
            status: TripStatus.COMPLETED,
            completedAt: expect.any(Date),
            fuelLiters: 90.5,
            distanceKm: 250.5,
          }),
        }),
      );
      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: LOAD_ID },
        data: { status: LoadStatus.DELIVERED },
      });
    });

    it('stores null fuelLiters when none is provided', async () => {
      prisma.trip.findUnique.mockResolvedValue(inProgressTrip);
      await service.completeTrip(TRIP_ID, CARRIER_ID);
      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fuelLiters: null }),
        }),
      );
    });

    it('stores null distance when OSRM fails (best-effort)', async () => {
      prisma.trip.findUnique.mockResolvedValue(inProgressTrip);
      mockedFetchRouteDistanceKm.mockResolvedValue(null);
      await service.completeTrip(TRIP_ID, CARRIER_ID, 50);
      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ distanceKm: null }),
        }),
      );
    });

    it('skips the OSRM call and stores null distance when the trip has no load', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        ...inProgressTrip,
        load: null,
      });
      await service.completeTrip(TRIP_ID, CARRIER_ID, 50);
      expect(mockedFetchRouteDistanceKm).not.toHaveBeenCalled();
      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ distanceKm: null }),
        }),
      );
    });
  });

  describe('getCarrierMetrics', () => {
    it('returns zeroed metrics when the carrier has no trips', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      const result = await service.getCarrierMetrics(CARRIER_ID);
      expect(result.completedTrips).toBe(0);
      expect(result.onTimeDeliveries).toBe(0);
      expect(result.lateDeliveries).toBe(0);
      expect(result.onTimeRate).toBeNull();
      expect(result.totalDistanceKm).toBe(0);
      expect(result.totalFuelLiters).toBe(0);
      expect(result.avgKmPerLiter).toBeNull();
    });

    it('counts only COMPLETED trips and aggregates fuel/distance metrics', async () => {
      const onTimeDate = new Date('2026-06-05T10:00:00Z');
      const deliveryDate = new Date('2026-06-10T10:00:00Z');
      const lateCompleted = new Date('2026-06-15T10:00:00Z');

      prisma.trip.findMany.mockResolvedValue([
        // on-time completed: 100km / 50L
        {
          status: TripStatus.COMPLETED,
          completedAt: onTimeDate,
          fuelLiters: 50,
          distanceKm: 100,
          load: { deliveryDate },
        },
        // late completed: 200km / 50L
        {
          status: TripStatus.COMPLETED,
          completedAt: lateCompleted,
          fuelLiters: 50,
          distanceKm: 200,
          load: { deliveryDate },
        },
        // in-progress: ignored by metrics + completedTrips
        {
          status: TripStatus.IN_PROGRESS,
          completedAt: null,
          fuelLiters: 999,
          distanceKm: 999,
          load: { deliveryDate: null },
        },
      ]);

      const result = await service.getCarrierMetrics(CARRIER_ID);

      expect(result.completedTrips).toBe(2);
      expect(result.onTimeDeliveries).toBe(1);
      expect(result.lateDeliveries).toBe(1);
      expect(result.onTimeRate).toBeCloseTo(0.5);
      expect(result.totalDistanceKm).toBe(300);
      expect(result.totalFuelLiters).toBe(100);
      expect(result.avgKmPerLiter).toBe(3); // 300 / 100
    });

    it('leaves on-time metrics unmeasured for completed trips without a deliveryDate', async () => {
      prisma.trip.findMany.mockResolvedValue([
        {
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-06-05T10:00:00Z'),
          fuelLiters: 40,
          distanceKm: 80,
          load: { deliveryDate: null },
        },
      ]);

      const result = await service.getCarrierMetrics(CARRIER_ID);
      expect(result.onTimeDeliveries).toBe(0);
      expect(result.lateDeliveries).toBe(0);
      expect(result.onTimeRate).toBeNull();
      expect(result.totalDistanceKm).toBe(80);
      expect(result.avgKmPerLiter).toBe(2);
    });

    it('returns null avgKmPerLiter when no fuel is registered', async () => {
      prisma.trip.findMany.mockResolvedValue([
        {
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-06-05T10:00:00Z'),
          fuelLiters: null,
          distanceKm: 120,
          load: { deliveryDate: null },
        },
      ]);
      const result = await service.getCarrierMetrics(CARRIER_ID);
      expect(result.totalFuelLiters).toBe(0);
      expect(result.avgKmPerLiter).toBeNull();
    });
  });

  describe('updateLocation', () => {
    it('throws ForbiddenException when the trip belongs to another carrier', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        ...baseTrip,
        carrierId: 'other-carrier',
      });
      await expect(
        service.updateLocation(TRIP_ID, CARRIER_ID, -34.6, -58.4),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    const inProgressTrip = { ...baseTrip, status: TripStatus.IN_PROGRESS };

    it.each([TripStatus.ACCEPTED, TripStatus.COMPLETED, TripStatus.CANCELLED])(
      'throws BadRequestException when the trip is %s',
      async (status) => {
        prisma.trip.findUnique.mockResolvedValue({ ...baseTrip, status });
        await expect(
          service.updateLocation(TRIP_ID, CARRIER_ID, -34.6, -58.4),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.trip.update).not.toHaveBeenCalled();
      },
    );

    it('persists the new GPS coordinates', async () => {
      prisma.trip.findUnique.mockResolvedValue(inProgressTrip);
      prisma.trip.update.mockResolvedValue({
        ...baseTrip,
        currentLat: -34.6037,
        currentLng: -58.3816,
      });

      const result = await service.updateLocation(
        TRIP_ID,
        CARRIER_ID,
        -34.6037,
        -58.3816,
      );

      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: TRIP_ID },
        data: { currentLat: -34.6037, currentLng: -58.3816 },
      });
      expect(result.currentLat).toBe(-34.6037);
      expect(result.currentLng).toBe(-58.3816);
    });

    it('passes through zero coordinates without coercion', async () => {
      prisma.trip.findUnique.mockResolvedValue(inProgressTrip);
      prisma.trip.update.mockResolvedValue(inProgressTrip);
      await service.updateLocation(TRIP_ID, CARRIER_ID, 0, 0);
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: TRIP_ID },
        data: { currentLat: 0, currentLng: 0 },
      });
    });

    it('propagates NotFoundException from findById when the trip is missing', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(
        service.updateLocation(TRIP_ID, CARRIER_ID, 1, 2),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
