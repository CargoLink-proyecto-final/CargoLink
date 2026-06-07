import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
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
    };
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
      },
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

    it('defaults pendingPostulationsCount to 0 when _count missing', async () => {
      prisma.load.findMany.mockResolvedValue([{ ...baseLoad }]);
      const result = await service.findAll();
      expect(result.loads[0].pendingPostulationsCount).toBe(0);
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

  describe('findAvailable', () => {
    it('delegates to findAll forcing PUBLISHED status', async () => {
      const spy = jest.spyOn(service, 'findAll').mockResolvedValue({} as any);
      await service.findAvailable({ page: 2, limit: 5 });
      expect(spy).toHaveBeenCalledWith({ page: 2, limit: 5, status: LoadStatus.PUBLISHED });
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

    it('throws ForbiddenException when load is not PUBLISHED', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        status: LoadStatus.ASSIGNED,
        _count: { postulations: 0 },
      });
      await expect(
        service.update('load-1', 'shipper-1', {} as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.load.update).not.toHaveBeenCalled();
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
});
