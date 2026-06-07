import { Test, TestingModule } from '@nestjs/testing';
import { TripStatus } from '@prisma/client';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

describe('TripsController', () => {
  let controller: TripsController;
  let service: {
    acceptLoad: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    startTrip: jest.Mock;
    completeTrip: jest.Mock;
    getCarrierMetrics: jest.Mock;
    updateLocation: jest.Mock;
  };

  const USER_ID = 'user-1';

  beforeEach(async () => {
    service = {
      acceptLoad: jest.fn().mockResolvedValue('accept-result'),
      findAll: jest.fn().mockResolvedValue('findAll-result'),
      findById: jest.fn().mockResolvedValue('findById-result'),
      startTrip: jest.fn().mockResolvedValue('start-result'),
      completeTrip: jest.fn().mockResolvedValue('complete-result'),
      getCarrierMetrics: jest.fn().mockResolvedValue('metrics-result'),
      updateLocation: jest.fn().mockResolvedValue('location-result'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [{ provide: TripsService, useValue: service }],
    }).compile();

    controller = module.get<TripsController>(TripsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('acceptLoad', () => {
    it('delegates the admin force-accept to the service with user + load', async () => {
      const result = await controller.acceptLoad(USER_ID, 'load-9');
      expect(service.acceptLoad).toHaveBeenCalledWith(USER_ID, 'load-9');
      expect(result).toBe('accept-result');
    });
  });

  describe('findAll', () => {
    it('forwards status/page/limit query params (admin listing)', async () => {
      const result = await controller.findAll(TripStatus.COMPLETED, 2, 10);
      expect(service.findAll).toHaveBeenCalledWith({
        status: TripStatus.COMPLETED,
        page: 2,
        limit: 10,
      });
      expect(result).toBe('findAll-result');
    });

    it('passes undefined filters when no query params are given', async () => {
      await controller.findAll();
      expect(service.findAll).toHaveBeenCalledWith({
        status: undefined,
        page: undefined,
        limit: undefined,
      });
    });
  });

  describe('findMyTrips', () => {
    it('scopes the listing to the current carrier', async () => {
      await controller.findMyTrips(USER_ID, TripStatus.IN_PROGRESS, 1, 5);
      expect(service.findAll).toHaveBeenCalledWith({
        carrierId: USER_ID,
        status: TripStatus.IN_PROGRESS,
        page: 1,
        limit: 5,
      });
    });
  });

  describe('getMyMetrics', () => {
    it('returns the carrier fuel/on-time metrics for the current user', async () => {
      const result = await controller.getMyMetrics(USER_ID);
      expect(service.getCarrierMetrics).toHaveBeenCalledWith(USER_ID);
      expect(result).toBe('metrics-result');
    });
  });

  describe('findMyLoadTrips', () => {
    it('scopes the listing to the current shipper', async () => {
      await controller.findMyLoadTrips(USER_ID, TripStatus.ACCEPTED, 3, 15);
      expect(service.findAll).toHaveBeenCalledWith({
        shipperId: USER_ID,
        status: TripStatus.ACCEPTED,
        page: 3,
        limit: 15,
      });
    });
  });

  describe('findOne', () => {
    it('delegates to findById', async () => {
      const result = await controller.findOne('trip-7');
      expect(service.findById).toHaveBeenCalledWith('trip-7');
      expect(result).toBe('findById-result');
    });
  });

  describe('startTrip', () => {
    it('delegates to startTrip with trip id + current user', async () => {
      const result = await controller.startTrip('trip-7', USER_ID);
      expect(service.startTrip).toHaveBeenCalledWith('trip-7', USER_ID);
      expect(result).toBe('start-result');
    });
  });

  describe('completeTrip', () => {
    it('passes the fuelLiters from the body to the service', async () => {
      const result = await controller.completeTrip('trip-7', USER_ID, {
        fuelLiters: 88.2,
      });
      expect(service.completeTrip).toHaveBeenCalledWith('trip-7', USER_ID, 88.2);
      expect(result).toBe('complete-result');
    });

    it('passes undefined when fuelLiters is omitted from the body', async () => {
      await controller.completeTrip('trip-7', USER_ID, {});
      expect(service.completeTrip).toHaveBeenCalledWith(
        'trip-7',
        USER_ID,
        undefined,
      );
    });
  });

  describe('updateLocation', () => {
    it('unpacks lat/lng from the body into positional service args', async () => {
      const result = await controller.updateLocation('trip-7', USER_ID, {
        lat: -34.6037,
        lng: -58.3816,
      });
      expect(service.updateLocation).toHaveBeenCalledWith(
        'trip-7',
        USER_ID,
        -34.6037,
        -58.3816,
      );
      expect(result).toBe('location-result');
    });
  });
});
