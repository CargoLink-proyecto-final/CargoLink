import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { LoadStatus } from '@prisma/client';
import { LoadsService } from './loads.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LoadsService', () => {
  let service: LoadsService;
  let prisma: {
    load: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      groupBy: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    city: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    rating: { groupBy: jest.Mock };
  };

  const baseLoad = {
    id: 'load-1',
    title: 'Electronics shipment',
    shipperId: 'shipper-1',
    status: LoadStatus.PUBLISHED,
    cargoType: 'Electronics',
    weight: 5000,
    price: 150000,
    originAddress: 'Origin',
    destAddress: 'Dest',
    pickupDate: new Date('2026-02-15T10:00:00Z'),
    deliveryDate: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    prisma = {
      load: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn(),
      },
      city: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
      },
      // getShipperMetrics cruza las cargas con las calificaciones que dio.
      rating: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LoadsService>(LoadsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      title: 'New load',
      originAddress: 'A',
      originLat: -34.6,
      originLng: -58.3,
      destAddress: 'B',
      destLat: -31.4,
      destLng: -64.1,
      cargoType: 'Electronics',
      weight: 5000,
      pickupDate: '2026-02-15T10:00:00Z',
      price: 150000,
    } as any;

    it('creates a load with parsed pickupDate and shipperId, deliveryDate undefined when absent', async () => {
      prisma.load.create.mockResolvedValue({ ...baseLoad, ...dto });
      const result = await service.create('shipper-1', dto);

      expect(prisma.load.create).toHaveBeenCalledTimes(1);
      const arg = prisma.load.create.mock.calls[0][0];
      expect(arg.data.shipperId).toBe('shipper-1');
      expect(arg.data.pickupDate).toEqual(new Date(dto.pickupDate));
      expect(arg.data.deliveryDate).toBeUndefined();
      expect(arg.include.shipper).toBeDefined();
      expect(result).toBeDefined();
    });

    it('parses deliveryDate when provided', async () => {
      prisma.load.create.mockResolvedValue(baseLoad);
      await service.create('shipper-1', { ...dto, deliveryDate: '2026-02-16T18:00:00Z' });
      const arg = prisma.load.create.mock.calls[0][0];
      expect(arg.data.deliveryDate).toEqual(new Date('2026-02-16T18:00:00Z'));
    });
  });

  describe('validación de las ciudades del padrón', () => {
    it('rechaza con 400 una ciudad de origen inexistente', async () => {
      prisma.city.count.mockResolvedValue(0);
      await expect(
        service.create('shipper-1', { originCityId: 'no-existe' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.load.create).not.toHaveBeenCalled();
    });

    it('deja pasar la creación cuando la ciudad existe', async () => {
      prisma.city.count.mockResolvedValue(1);
      prisma.load.create.mockResolvedValue({ id: 'load-1' });
      await service.create('shipper-1', {
        originCityId: 'city-1',
        pickupDate: '2026-01-01',
      } as any);
      expect(prisma.load.create).toHaveBeenCalled();
    });

    it('no consulta el padrón cuando no se manda ninguna ciudad', async () => {
      prisma.load.create.mockResolvedValue({ id: 'load-1' });
      await service.create('shipper-1', { pickupDate: '2026-01-01' } as any);
      expect(prisma.city.count).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.load.findMany.mockResolvedValue([
        { ...baseLoad, _count: { postulations: 3 } },
      ]);
      prisma.load.count.mockResolvedValue(1);
    });

    it('uses default page/limit and empty where when no params', async () => {
      const result = await service.findAll();
      const arg = prisma.load.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
      expect(arg.skip).toBe(0);
      expect(arg.take).toBe(20);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('shapes loads exposing pendingPostulationsCount and removing _count', async () => {
      const result = await service.findAll();
      expect(result.loads[0]).not.toHaveProperty('_count');
      expect(result.loads[0].pendingPostulationsCount).toBe(3);
    });

    it('hides the postulation count when the caller asks to', async () => {
      prisma.load.findMany.mockResolvedValue([{ ...baseLoad, _count: { postulations: 3 } }]);
      const result = await service.findAll({ hidePostulationCount: true });
      expect(result.loads[0].pendingPostulationsCount).toBeUndefined();
    });

    it('defaults pendingPostulationsCount to 0 when _count missing', async () => {
      prisma.load.findMany.mockResolvedValue([{ ...baseLoad }]);
      const result = await service.findAll();
      expect(result.loads[0].pendingPostulationsCount).toBe(0);
    });

    it('orders loads by proximity to the zone when prioritizeZone is set (P12)', async () => {
      // La query devuelve lejos→cerca (orden por createdAt); la priorización por
      // zona debe reordenar dejando el origen más cercano primero.
      prisma.load.findMany.mockResolvedValue([
        { ...baseLoad, id: 'far', originLat: -34.6, originLng: -58.4, _count: { postulations: 0 } }, // Buenos Aires
        { ...baseLoad, id: 'near', originLat: -31.4, originLng: -64.2, _count: { postulations: 0 } }, // Córdoba
      ]);
      const result = await service.findAll({
        status: LoadStatus.PUBLISHED,
        prioritizeZone: { lat: -31.42, lng: -64.19 }, // Córdoba
      });
      expect(result.loads.map((l: any) => l.id)).toEqual(['near', 'far']);
      expect(result.total).toBe(2);
    });

    it('applies status and shipperId filters', async () => {
      await service.findAll({ status: LoadStatus.PUBLISHED, shipperId: 'shipper-1' });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(LoadStatus.PUBLISHED);
      expect(where.shipperId).toBe('shipper-1');
    });

    it('applies cargoType as case-insensitive contains', async () => {
      await service.findAll({ cargoType: 'elec' });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.cargoType).toEqual({ contains: 'elec', mode: 'insensitive' });
    });

    it('applies free-text q across title/origin/dest via AND.OR', async () => {
      await service.findAll({ q: 'foo' });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(1);
      expect(where.AND[0].OR).toEqual([
        { title: { contains: 'foo', mode: 'insensitive' } },
        { originAddress: { contains: 'foo', mode: 'insensitive' } },
        { destAddress: { contains: 'foo', mode: 'insensitive' } },
      ]);
    });

    it('applies weight range (both bounds)', async () => {
      await service.findAll({ minWeight: 100, maxWeight: 9000 });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.weight).toEqual({ gte: 100, lte: 9000 });
    });

    it('applies only minWeight bound', async () => {
      await service.findAll({ minWeight: 100 });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.weight).toEqual({ gte: 100 });
    });

    it('applies price range (both bounds)', async () => {
      await service.findAll({ minPrice: 1000, maxPrice: 50000 });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.price).toEqual({ gte: 1000, lte: 50000 });
    });

    it('applies createdAt range with end-of-day on createdTo', async () => {
      await service.findAll({ createdFrom: '2026-01-01', createdTo: '2026-01-31' });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.createdAt.gte).toEqual(new Date('2026-01-01'));
      const expectedEnd = new Date('2026-01-31');
      expectedEnd.setHours(23, 59, 59, 999);
      expect(where.createdAt.lte).toEqual(expectedEnd);
    });

    it('filters by the city foreign keys, not by address text', async () => {
      await service.findAll({ originCityId: 'city-1', destCityId: 'city-2' });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.originCityId).toBe('city-1');
      expect(where.destCityId).toBe('city-2');
      expect(where.originAddress).toBeUndefined();
    });

    it('does not constrain cities when none is provided', async () => {
      await service.findAll({});
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.originCityId).toBeUndefined();
      expect(where.destCityId).toBeUndefined();
    });

    it('applies pickupDate and deliveryDate ranges', async () => {
      await service.findAll({ pickupFrom: '2026-02-01', deliveryTo: '2026-03-01' });
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.pickupDate.gte).toEqual(new Date('2026-02-01'));
      expect(where.deliveryDate.lte).toBeInstanceOf(Date);
    });

    it('does not set a date range when neither bound provided', async () => {
      await service.findAll({});
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.createdAt).toBeUndefined();
      expect(where.pickupDate).toBeUndefined();
      expect(where.deliveryDate).toBeUndefined();
    });

    it('computes pagination skip/take and totalPages', async () => {
      prisma.load.count.mockResolvedValue(45);
      const result = await service.findAll({ page: 3, limit: 20 });
      const arg = prisma.load.findMany.mock.calls[0][0];
      expect(arg.skip).toBe(40);
      expect(arg.take).toBe(20);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('findAvailable — visibilidad del conteo', () => {
    it('no le expone a un transportista cuántos se postularon', async () => {
      prisma.user.findUnique.mockResolvedValue({ zoneLat: null, zoneLng: null });
      prisma.load.findMany.mockResolvedValue([{ ...baseLoad, _count: { postulations: 4 } }]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAvailable('carrier-1');

      expect(result.loads[0].pendingPostulationsCount).toBeUndefined();
    });
  });

  describe('findAvailable', () => {
    it('delegates to findAll forcing PUBLISHED status (no zone → no prioritization)', async () => {
      prisma.user.findUnique.mockResolvedValue({ zoneLat: null, zoneLng: null });
      const spy = jest.spyOn(service, 'findAll').mockResolvedValue({} as any);
      await service.findAvailable('carrier-1', { page: 2, limit: 5 });
      expect(spy).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        status: LoadStatus.PUBLISHED,
        prioritizeZone: undefined,
        hidePostulationCount: true,
      });
    });

    it('prioritizes by the carrier zone when one is set', async () => {
      prisma.user.findUnique.mockResolvedValue({ zoneLat: -31.42, zoneLng: -64.18 });
      const spy = jest.spyOn(service, 'findAll').mockResolvedValue({} as any);
      await service.findAvailable('carrier-1', { page: 1, limit: 5 });
      expect(spy).toHaveBeenCalledWith({
        page: 1,
        limit: 5,
        status: LoadStatus.PUBLISHED,
        prioritizeZone: { lat: -31.42, lng: -64.18 },
        hidePostulationCount: true,
      });
    });
  });

  describe('findFilterCities', () => {
    const cityRows = [
      { id: 'city-1', code: '06638040', name: 'Pilar', department: 'Pilar', lat: -34.4, lng: -58.9, province: { id: 'prov-1', name: 'Buenos Aires' } },
      { id: 'city-2', code: '14014010', name: 'Córdoba', department: 'Capital', lat: -31.4, lng: -64.1, province: { id: 'prov-2', name: 'Córdoba' } },
    ];

    beforeEach(() => {
      prisma.load.groupBy
        .mockResolvedValueOnce([{ originCityId: 'city-1' }])
        .mockResolvedValueOnce([{ destCityId: 'city-2' }]);
      prisma.city.findMany.mockResolvedValue(cityRows);
    });

    it('scopes a shipper to their own loads', async () => {
      await service.findFilterCities({ id: 'shipper-1', role: 'CARGO_GENERATOR' });
      expect(prisma.load.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shipperId: 'shipper-1', originCityId: { not: null } },
        }),
      );
    });

    it('scopes a carrier to published loads', async () => {
      await service.findFilterCities({ id: 'carrier-1', role: 'TRANSPORTER' });
      expect(prisma.load.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: LoadStatus.PUBLISHED, originCityId: { not: null } },
        }),
      );
    });

    it('does not scope an admin', async () => {
      await service.findFilterCities({ id: 'admin-1', role: 'ADMIN' });
      expect(prisma.load.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { originCityId: { not: null } } }),
      );
    });

    it('returns each leg separately with the province flattened in', async () => {
      const result = await service.findFilterCities({ id: 'admin-1', role: 'ADMIN' });
      expect(result.origin).toEqual([
        expect.objectContaining({ id: 'city-1', name: 'Pilar', provinceName: 'Buenos Aires' }),
      ]);
      expect(result.dest).toEqual([
        expect.objectContaining({ id: 'city-2', name: 'Córdoba', provinceName: 'Córdoba' }),
      ]);
    });
  });

  describe('findById', () => {
    it('returns the shaped load when found', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        _count: { postulations: 2 },
      });
      const result = await service.findById('load-1');
      expect(result).not.toHaveProperty('_count');
      expect(result.pendingPostulationsCount).toBe(2);
      expect(result.id).toBe('load-1');
    });

    it('defaults pendingPostulationsCount to 0 when _count missing', async () => {
      prisma.load.findUnique.mockResolvedValue({ ...baseLoad });
      const result = await service.findById('load-1');
      expect(result.pendingPostulationsCount).toBe(0);
    });

    it('throws NotFoundException when load does not exist', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates own published load and parses dates when provided', async () => {
      prisma.load.findUnique.mockResolvedValue({ ...baseLoad, _count: { postulations: 0 } });
      prisma.load.update.mockResolvedValue({ ...baseLoad, title: 'Updated' });

      const result = await service.update('load-1', 'shipper-1', {
        title: 'Updated',
        pickupDate: '2026-05-01T00:00:00Z',
      } as any);

      const arg = prisma.load.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'load-1' });
      expect(arg.data.pickupDate).toEqual(new Date('2026-05-01T00:00:00Z'));
      expect(arg.data.deliveryDate).toBeUndefined();
      expect(result.title).toBe('Updated');
    });

    it('leaves pickupDate undefined when not provided in dto', async () => {
      prisma.load.findUnique.mockResolvedValue({ ...baseLoad, _count: { postulations: 0 } });
      prisma.load.update.mockResolvedValue(baseLoad);
      await service.update('load-1', 'shipper-1', { title: 'x' } as any);
      const arg = prisma.load.update.mock.calls[0][0];
      expect(arg.data.pickupDate).toBeUndefined();
      expect(arg.data.deliveryDate).toBeUndefined();
    });

    it('throws ForbiddenException when editing another shipper load', async () => {
      prisma.load.findUnique.mockResolvedValue({ ...baseLoad, _count: { postulations: 0 } });
      await expect(
        service.update('load-1', 'other-user', {} as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.load.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when editing a finalized/cancelled load', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        status: LoadStatus.DELIVERED,
        _count: { postulations: 0 },
      });
      await expect(
        service.update('load-1', 'shipper-1', { title: 'x' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.load.update).not.toHaveBeenCalled();
    });

    it('locks critical fields once the load has an accepted postulation', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        status: LoadStatus.ASSIGNED,
        _count: { postulations: 0 },
      });
      await expect(
        service.update('load-1', 'shipper-1', { weight: 999 } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.load.update).not.toHaveBeenCalled();
    });

    it('locks the city foreign keys too, no solo la dirección', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        status: LoadStatus.IN_TRANSIT,
        _count: { postulations: 0 },
      });
      await expect(
        service.update('load-1', 'shipper-1', { originCityId: 'city-9' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.load.update).not.toHaveBeenCalled();
    });

    it('allows editing title/description on an assigned load', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        status: LoadStatus.ASSIGNED,
        _count: { postulations: 0 },
      });
      prisma.load.update.mockResolvedValue({ ...baseLoad, title: 'New title' });
      const result = await service.update('load-1', 'shipper-1', {
        title: 'New title',
        description: 'Updated notes',
      } as any);
      expect(prisma.load.update).toHaveBeenCalled();
      expect(result.title).toBe('New title');
    });

    it('propagates NotFoundException from findById', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', 'shipper-1', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels own load setting status CANCELLED', async () => {
      prisma.load.findUnique.mockResolvedValue({ ...baseLoad, _count: { postulations: 0 } });
      prisma.load.update.mockResolvedValue({ ...baseLoad, status: LoadStatus.CANCELLED });

      const result = await service.cancel('load-1', 'shipper-1');
      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 'load-1' },
        data: { status: LoadStatus.CANCELLED },
      });
      expect(result.status).toBe(LoadStatus.CANCELLED);
    });

    it('throws ForbiddenException when cancelling another shipper load', async () => {
      prisma.load.findUnique.mockResolvedValue({ ...baseLoad, _count: { postulations: 0 } });
      await expect(service.cancel('load-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.load.update).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException from findById', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await expect(service.cancel('missing', 'shipper-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRegister', () => {
    const registerRow = {
      ...baseLoad,
      status: LoadStatus.DELIVERED,
      description: 'desc',
      volume: 10,
      originLat: -34,
      originLng: -58,
      destLat: -31,
      destLng: -64,
      shipper: { id: 'shipper-1', firstName: 'S', lastName: 'One' },
      trip: {
        id: 'trip-1',
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        notes: 'n',
        carrier: { id: 'carrier-1', firstName: 'C', lastName: 'One' },
        messages: [{ content: 'hi', createdAt: new Date(), senderId: 'carrier-1' }],
        _count: { messages: 5 },
      },
    };

    beforeEach(() => {
      prisma.load.findMany.mockResolvedValue([registerRow]);
      prisma.load.count.mockResolvedValue(1);
    });

    it('returns paginated shaped items with trip data', async () => {
      const result = await service.getRegister(
        { id: 'admin-1', role: 'ADMIN' },
        {} as any,
      );
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      const item = result.items[0];
      expect(item.id).toBe('load-1');
      expect(item.trip!.messageCount).toBe(5);
      expect(item.trip!.lastMessagePreview).toEqual(registerRow.trip.messages[0]);
    });

    it('shapes trip as null when load has no trip', async () => {
      prisma.load.findMany.mockResolvedValue([{ ...registerRow, trip: null }]);
      const result = await service.getRegister({ id: 'admin-1', role: 'ADMIN' }, {} as any);
      expect(result.items[0].trip).toBeNull();
    });

    it('defaults messageCount to 0 and lastMessagePreview to null', async () => {
      prisma.load.findMany.mockResolvedValue([
        { ...registerRow, trip: { ...registerRow.trip, _count: undefined, messages: [] } },
      ]);
      const result = await service.getRegister({ id: 'admin-1', role: 'ADMIN' }, {} as any);
      expect(result.items[0].trip!.messageCount).toBe(0);
      expect(result.items[0].trip!.lastMessagePreview).toBeNull();
    });

    it('defaults to terminal statuses when none given', async () => {
      await service.getRegister({ id: 'admin-1', role: 'ADMIN' }, {} as any);
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: [LoadStatus.DELIVERED, LoadStatus.CANCELLED] });
    });

    it('uses provided statuses when present', async () => {
      await service.getRegister(
        { id: 'admin-1', role: 'ADMIN' },
        { statuses: [LoadStatus.DELIVERED] } as any,
      );
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: [LoadStatus.DELIVERED] });
    });

    it('scopes CARGO_GENERATOR to own shipperId', async () => {
      await service.getRegister({ id: 'shipper-9', role: 'CARGO_GENERATOR' }, {} as any);
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.shipperId).toBe('shipper-9');
      expect(where.trip).toBeUndefined();
    });

    it('scopes TRANSPORTER to trips they carried', async () => {
      await service.getRegister({ id: 'carrier-9', role: 'TRANSPORTER' }, {} as any);
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.trip).toEqual({ carrierId: 'carrier-9' });
      expect(where.shipperId).toBeUndefined();
    });

    it('does not scope ADMIN to a participant', async () => {
      await service.getRegister({ id: 'admin-1', role: 'ADMIN' }, {} as any);
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.shipperId).toBeUndefined();
      expect(where.trip).toBeUndefined();
    });

    it('applies pickupDate range from from/to', async () => {
      await service.getRegister(
        { id: 'admin-1', role: 'ADMIN' },
        { from: '2026-01-01', to: '2026-12-31' } as any,
      );
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.pickupDate.gte).toEqual(new Date('2026-01-01'));
      expect(where.pickupDate.lte).toEqual(new Date('2026-12-31'));
    });

    it('adds free-text q condition to AND', async () => {
      await service.getRegister({ id: 'admin-1', role: 'ADMIN' }, { q: 'bar' } as any);
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(1);
      expect(where.AND[0].OR).toHaveLength(4);
    });

    it('adds participant condition only for ADMIN', async () => {
      await service.getRegister(
        { id: 'admin-1', role: 'ADMIN' },
        { participant: 'Acme' } as any,
      );
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(1);
      expect(where.AND[0].OR).toHaveLength(6);
    });

    it('ignores participant filter for non-ADMIN roles', async () => {
      await service.getRegister(
        { id: 'shipper-1', role: 'CARGO_GENERATOR' },
        { participant: 'Acme' } as any,
      );
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.AND).toBeUndefined();
    });

    it('combines q and participant into two AND conditions for ADMIN', async () => {
      await service.getRegister(
        { id: 'admin-1', role: 'ADMIN' },
        { q: 'bar', participant: 'Acme' } as any,
      );
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(2);
    });

    it('honors page and limit pagination', async () => {
      prisma.load.count.mockResolvedValue(50);
      const result = await service.getRegister(
        { id: 'admin-1', role: 'ADMIN' },
        { page: 2, limit: 10 } as any,
      );
      const arg = prisma.load.findMany.mock.calls[0][0];
      expect(arg.skip).toBe(10);
      expect(arg.take).toBe(10);
      expect(result.totalPages).toBe(5);
    });
  });

  describe('getRegisterForExport', () => {
    it('returns rows when under the export cap', async () => {
      prisma.load.count.mockResolvedValue(10);
      prisma.load.findMany.mockResolvedValue([baseLoad]);
      const result = await service.getRegisterForExport(
        { id: 'admin-1', role: 'ADMIN' },
        {} as any,
      );
      expect(result).toEqual([baseLoad]);
      expect(prisma.load.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns rows exactly at the cap (5000)', async () => {
      prisma.load.count.mockResolvedValue(5000);
      prisma.load.findMany.mockResolvedValue([]);
      await expect(
        service.getRegisterForExport({ id: 'admin-1', role: 'ADMIN' }, {} as any),
      ).resolves.toBeDefined();
    });

    it('throws PayloadTooLargeException above the cap', async () => {
      prisma.load.count.mockResolvedValue(5001);
      await expect(
        service.getRegisterForExport({ id: 'admin-1', role: 'ADMIN' }, {} as any),
      ).rejects.toThrow(PayloadTooLargeException);
      expect(prisma.load.findMany).not.toHaveBeenCalled();
    });

    it('applies role scoping via shared buildRegisterWhere (shipper)', async () => {
      prisma.load.count.mockResolvedValue(1);
      prisma.load.findMany.mockResolvedValue([]);
      await service.getRegisterForExport(
        { id: 'shipper-1', role: 'CARGO_GENERATOR' },
        {} as any,
      );
      const where = prisma.load.findMany.mock.calls[0][0].where;
      expect(where.shipperId).toBe('shipper-1');
    });
  });

  // ------------------------------------------------------------------
  // getShipperMetrics
  // ------------------------------------------------------------------
  describe('getShipperMetrics', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

    it('returns zeroed metrics when the shipper has no loads', async () => {
      prisma.load.findMany.mockResolvedValue([]);

      const result = await service.getShipperMetrics('shipper-1');

      expect(result.totalLoads).toBe(0);
      expect(result.assignmentRate).toBeNull();
      expect(result.avgHoursToAssignment).toBeNull();
      expect(result.avgPostulationsPerLoad).toBeNull();
      expect(result.avgNegotiationDelta).toBeNull();
      expect(result.totalAmount).toBe(0);
      expect(result.topCarriers).toEqual([]);
      expect(result.spendByCargoType).toEqual([]);
      expect(result.monthly).toHaveLength(12);
      // Sin transportistas no hace falta ir a buscar calificaciones.
      expect(prisma.rating.groupBy).not.toHaveBeenCalled();
    });

    it('aggregates assignment, punctuality and spend across the shipper loads', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          status: LoadStatus.DELIVERED,
          price: 100000,
          cargoType: 'Granos',
          createdAt: hoursAgo(48),
          deliveryDate: hoursAgo(-24), // se comprometió para mañana
          _count: { postulations: 3 },
          postulations: [{ proposedPrice: 120000 }],
          trip: {
            status: 'COMPLETED',
            createdAt: hoursAgo(24),
            completedAt: hoursAgo(1),
            distanceKm: 200,
            carrier: {
              id: 'c1',
              firstName: 'Ana',
              lastName: 'Diaz',
              companyName: null,
            },
          },
        },
        {
          status: LoadStatus.PUBLISHED,
          price: 50000,
          cargoType: 'Cemento',
          createdAt: hoursAgo(5),
          deliveryDate: null,
          _count: { postulations: 1 },
          postulations: [],
          trip: null,
        },
        // Cancelada: no penaliza la tasa de asignación.
        {
          status: LoadStatus.CANCELLED,
          price: 20000,
          cargoType: 'Cemento',
          createdAt: hoursAgo(72),
          deliveryDate: null,
          _count: { postulations: 0 },
          postulations: [],
          trip: null,
        },
      ]);
      prisma.rating.groupBy.mockResolvedValue([
        { toUserId: 'c1', _avg: { score: 5 } },
      ]);

      const result = await service.getShipperMetrics('shipper-1');

      expect(result.totalLoads).toBe(3);
      expect(result.deliveredLoads).toBe(1);
      expect(result.publishedLoads).toBe(1);
      expect(result.cancelledLoads).toBe(1);
      // 1 de las 2 asignables consiguió transportista.
      expect(result.assignmentRate).toBe(0.5);
      expect(result.avgHoursToAssignment).toBe(24);
      expect(result.avgPostulationsPerLoad).toBe(1.3); // (3 + 1 + 0) / 3
      expect(result.onTimeDeliveries).toBe(1);
      expect(result.lateDeliveries).toBe(0);
      // Pagó 20% más que el precio publicado.
      expect(result.avgNegotiationDelta).toBeCloseTo(0.2);
      expect(result.negotiatedLoads).toBe(1);
      expect(result.totalAmount).toBe(120000);
      expect(result.topCarriers).toEqual([
        {
          id: 'c1',
          name: 'Ana Diaz',
          completedTrips: 1,
          totalSpend: 120000,
          avgRating: 5,
        },
      ]);
      expect(result.spendByCargoType).toEqual([
        { cargoType: 'Granos', trips: 1, amount: 120000 },
      ]);
    });
  });
});
