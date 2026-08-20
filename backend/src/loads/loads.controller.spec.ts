import { Test, TestingModule } from '@nestjs/testing';
import { LoadStatus } from '@prisma/client';
import { LoadsController } from './loads.controller';
import { LoadsService } from './loads.service';

// Mock archiver so exportRegister can be exercised without a real zip stream.
const appendMock = jest.fn();
const pipeMock = jest.fn();
const finalizeMock = jest.fn().mockResolvedValue(undefined);
const onMock = jest.fn();
jest.mock('archiver', () =>
  jest.fn(() => ({
    append: appendMock,
    pipe: pipeMock,
    finalize: finalizeMock,
    on: onMock,
  })),
);

describe('LoadsController', () => {
  let controller: LoadsController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findAvailable: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    cancel: jest.Mock;
    getRegister: jest.Mock;
    getRegisterForExport: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'load-1' }),
      findAll: jest.fn().mockResolvedValue({ loads: [], total: 0 }),
      findAvailable: jest.fn().mockResolvedValue({ loads: [], total: 0 }),
      findById: jest.fn().mockResolvedValue({ id: 'load-1' }),
      update: jest.fn().mockResolvedValue({ id: 'load-1' }),
      cancel: jest.fn().mockResolvedValue({ id: 'load-1' }),
      getRegister: jest.fn().mockResolvedValue({ items: [] }),
      getRegisterForExport: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoadsController],
      providers: [{ provide: LoadsService, useValue: service }],
    }).compile();

    controller = module.get<LoadsController>(LoadsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to service.create with userId and dto', async () => {
      const dto = { title: 'x' } as any;
      const result = await controller.create('shipper-1', dto);
      expect(service.create).toHaveBeenCalledWith('shipper-1', dto);
      expect(result).toEqual({ id: 'load-1' });
    });
  });

  describe('findAll', () => {
    it('forwards all filters and coerces numeric ranges', async () => {
      await controller.findAll(
        'ADMIN',
        LoadStatus.PUBLISHED,
        'Electronics',
        'foo',
        'city-origin',
        'city-dest',
        100 as any,
        9000 as any,
        1000 as any,
        50000 as any,
        '2026-01-01',
        '2026-01-31',
        '2026-02-01',
        '2026-02-28',
        '2026-03-01',
        '2026-03-31',
        2 as any,
        10 as any,
      );
      expect(service.findAll).toHaveBeenCalledWith({
        status: LoadStatus.PUBLISHED,
        hidePostulationCount: false,
        cargoType: 'Electronics',
        q: 'foo',
        originCityId: 'city-origin',
        destCityId: 'city-dest',
        minWeight: 100,
        maxWeight: 9000,
        minPrice: 1000,
        maxPrice: 50000,
        createdFrom: '2026-01-01',
        createdTo: '2026-01-31',
        pickupFrom: '2026-02-01',
        pickupTo: '2026-02-28',
        deliveryFrom: '2026-03-01',
        deliveryTo: '2026-03-31',
        page: 2,
        limit: 10,
      });
    });

    it('hides the postulation count when a carrier hits the generic listing', async () => {
      await controller.findAll('TRANSPORTER');
      expect(service.findAll.mock.calls[0][0].hidePostulationCount).toBe(true);
    });

    it('leaves numeric range filters undefined when absent', async () => {
      await controller.findAll();
      const arg = service.findAll.mock.calls[0][0];
      expect(arg.minWeight).toBeUndefined();
      expect(arg.maxWeight).toBeUndefined();
      expect(arg.minPrice).toBeUndefined();
      expect(arg.maxPrice).toBeUndefined();
    });
  });

  describe('findAvailable', () => {
    it('delegates to service.findAvailable with the carrier id and filters', async () => {
      // El primer argumento es el userId del transportista (zona de influencia, P12).
      await controller.findAvailable('carrier-1', 'Electronics', 'q');
      expect(service.findAvailable).toHaveBeenCalled();
      const [carrierId, arg] = service.findAvailable.mock.calls[0];
      expect(carrierId).toBe('carrier-1');
      expect(arg.cargoType).toBe('Electronics');
      expect(arg.q).toBe('q');
    });
  });

  describe('findMyLoads', () => {
    it('scopes to the current user via shipperId', async () => {
      await controller.findMyLoads('shipper-1', LoadStatus.DELIVERED);
      const arg = service.findAll.mock.calls[0][0];
      expect(arg.shipperId).toBe('shipper-1');
      expect(arg.status).toBe(LoadStatus.DELIVERED);
    });
  });

  describe('getRegister', () => {
    it('delegates to service.getRegister with user and query', async () => {
      const user = { id: 'admin-1', role: 'ADMIN' };
      const query = { q: 'x' } as any;
      await controller.getRegister(user, query);
      expect(service.getRegister).toHaveBeenCalledWith(user, query);
    });
  });

  describe('findOne', () => {
    it('delegates to service.findById passing the viewer role', async () => {
      await controller.findOne('load-1', 'TRANSPORTER');
      expect(service.findById).toHaveBeenCalledWith('load-1', 'TRANSPORTER');
    });
  });

  describe('update', () => {
    it('delegates to service.update with id, userId, dto', async () => {
      const dto = { title: 'y' } as any;
      await controller.update('load-1', 'shipper-1', dto);
      expect(service.update).toHaveBeenCalledWith('load-1', 'shipper-1', dto);
    });
  });

  describe('cancel', () => {
    it('delegates to service.cancel with id and userId', async () => {
      await controller.cancel('load-1', 'shipper-1');
      expect(service.cancel).toHaveBeenCalledWith('load-1', 'shipper-1');
    });
  });

  describe('exportRegister', () => {
    const makeRes = () =>
      ({
        setHeader: jest.fn(),
      }) as any;

    it('sets zip headers, builds two CSV entries and finalizes', async () => {
      const user = { id: 'admin-1', role: 'ADMIN' };
      const query = {} as any;
      const res = makeRes();

      const trip = {
        id: 'trip-1',
        status: 'COMPLETED',
        startedAt: new Date('2026-01-02T00:00:00Z'),
        completedAt: new Date('2026-01-03T00:00:00Z'),
        notes: 'note, with comma',
        carrier: {
          id: 'carrier-1',
          firstName: 'Carl',
          lastName: 'Carrier',
          companyName: 'CarrierCo',
          email: 'carl@x.com',
          phone: '111',
        },
        messages: [
          {
            id: 'm1',
            senderId: 'carrier-1',
            sender: { id: 'carrier-1', firstName: 'Carl', lastName: 'Carrier' },
            content: 'hello',
            isRead: true,
            createdAt: new Date('2026-01-02T01:00:00Z'),
          },
        ],
      };
      service.getRegisterForExport.mockResolvedValue([
        {
          id: 'load-1',
          title: 'Title "quoted"',
          status: LoadStatus.DELIVERED,
          cargoType: 'Electronics',
          weight: 5000,
          volume: 12,
          price: 150000,
          originAddress: 'O',
          originLat: -34,
          originLng: -58,
          destAddress: 'D',
          destLat: -31,
          destLng: -64,
          pickupDate: new Date('2026-01-01T00:00:00Z'),
          deliveryDate: null,
          shipper: {
            id: 'shipper-1',
            firstName: 'Sue',
            lastName: 'Shipper',
            companyName: null,
            email: 's@x.com',
            phone: '222',
          },
          trip,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-04T00:00:00Z'),
        },
      ]);

      await controller.exportRegister(user, query, res);

      expect(service.getRegisterForExport).toHaveBeenCalledWith(user, query);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('registro-cargas-'),
      );
      expect(pipeMock).toHaveBeenCalledWith(res);
      expect(appendMock).toHaveBeenCalledTimes(2);
      expect(finalizeMock).toHaveBeenCalledTimes(1);

      const loadsCsvCall = appendMock.mock.calls.find((c) => c[1].name === 'loads.csv');
      const messagesCsvCall = appendMock.mock.calls.find((c) => c[1].name === 'messages.csv');
      expect(loadsCsvCall).toBeDefined();
      expect(messagesCsvCall).toBeDefined();

      const loadsCsv: string = loadsCsvCall[0];
      // CSV header present and a data row for the load.
      expect(loadsCsv).toContain('load_id,title,status');
      expect(loadsCsv).toContain('load-1');
      // Quote escaping: a value containing a double-quote is wrapped and doubled.
      expect(loadsCsv).toContain('"Title ""quoted"""');
      // Comma in notes triggers quoting.
      expect(loadsCsv).toContain('"note, with comma"');

      const messagesCsv: string = messagesCsvCall[0];
      expect(messagesCsv).toContain('message_id,trip_id,load_id');
      expect(messagesCsv).toContain('m1');
      expect(messagesCsv).toContain('hello');
    });

    it('handles loads without a trip (empty trip cells, no message rows)', async () => {
      const res = makeRes();
      service.getRegisterForExport.mockResolvedValue([
        {
          id: 'load-2',
          title: 'No trip',
          status: LoadStatus.CANCELLED,
          cargoType: 'General',
          weight: 100,
          volume: null,
          price: 50,
          originAddress: 'O',
          originLat: 0,
          originLng: 0,
          destAddress: 'D',
          destLat: 0,
          destLng: 0,
          pickupDate: new Date('2026-01-01T00:00:00Z'),
          deliveryDate: null,
          shipper: {
            id: 'shipper-2',
            firstName: 'Sam',
            lastName: 'Solo',
            companyName: null,
            email: 's2@x.com',
            phone: null,
          },
          trip: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);

      await controller.exportRegister({ id: 'admin-1', role: 'ADMIN' }, {} as any, res);

      const messagesCsvCall = appendMock.mock.calls.find((c) => c[1].name === 'messages.csv');
      const messagesCsv: string = messagesCsvCall[0];
      // Only the header line, no message rows.
      const lines = messagesCsv.split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
    });

    it('registers an error handler on the archive', async () => {
      const res = makeRes();
      service.getRegisterForExport.mockResolvedValue([]);
      await controller.exportRegister({ id: 'admin-1', role: 'ADMIN' }, {} as any, res);
      expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
