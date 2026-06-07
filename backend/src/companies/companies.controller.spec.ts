import { Test, TestingModule } from '@nestjs/testing';
import { JoinRequestStatus, TripStatus } from '@prisma/client';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let service: {
    listCompanies: jest.Mock;
    getMyCompany: jest.Mock;
    listDrivers: jest.Mock;
    getDriverStats: jest.Mock;
    removeDriver: jest.Mock;
    listRequests: jest.Mock;
    decideRequest: jest.Mock;
    listCompanyTrips: jest.Mock;
    getMyMembership: jest.Mock;
    createJoinRequest: jest.Mock;
    cancelJoinRequest: jest.Mock;
    leaveCompany: jest.Mock;
  };

  const userId = 'user-1';

  beforeEach(async () => {
    service = {
      listCompanies: jest.fn(),
      getMyCompany: jest.fn(),
      listDrivers: jest.fn(),
      getDriverStats: jest.fn(),
      removeDriver: jest.fn(),
      listRequests: jest.fn(),
      decideRequest: jest.fn(),
      listCompanyTrips: jest.fn(),
      getMyMembership: jest.fn(),
      createJoinRequest: jest.fn(),
      cancelJoinRequest: jest.fn(),
      leaveCompany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [{ provide: CompaniesService, useValue: service }],
    }).compile();

    controller = module.get<CompaniesController>(CompaniesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  // ---- Directory ----
  describe('list', () => {
    it('delegates to listCompanies', () => {
      const dir = [{ id: 'c1' }];
      service.listCompanies.mockReturnValue(dir);
      expect(controller.list()).toBe(dir);
      expect(service.listCompanies).toHaveBeenCalledWith();
    });
  });

  // ---- Company admin side ----
  describe('getMyCompany', () => {
    it('forwards the current user id', () => {
      const out = { id: 'company-1' };
      service.getMyCompany.mockReturnValue(out);
      expect(controller.getMyCompany(userId)).toBe(out);
      expect(service.getMyCompany).toHaveBeenCalledWith(userId);
    });
  });

  describe('listDrivers', () => {
    it('forwards the current user id', () => {
      service.listDrivers.mockReturnValue([]);
      controller.listDrivers(userId);
      expect(service.listDrivers).toHaveBeenCalledWith(userId);
    });
  });

  describe('getDriverStats', () => {
    it('forwards user id and driver id', () => {
      const out = { totalTrips: 3 };
      service.getDriverStats.mockReturnValue(out);
      expect(controller.getDriverStats(userId, 'd1')).toBe(out);
      expect(service.getDriverStats).toHaveBeenCalledWith(userId, 'd1');
    });
  });

  describe('removeDriver', () => {
    it('forwards user id and driver id', () => {
      service.removeDriver.mockReturnValue({ message: 'ok' });
      controller.removeDriver(userId, 'd1');
      expect(service.removeDriver).toHaveBeenCalledWith(userId, 'd1');
    });
  });

  describe('listRequests', () => {
    it('forwards user id without a status when none provided', () => {
      service.listRequests.mockReturnValue([]);
      controller.listRequests(userId);
      expect(service.listRequests).toHaveBeenCalledWith(userId, undefined);
    });

    it('forwards the status filter when provided', () => {
      service.listRequests.mockReturnValue([]);
      controller.listRequests(userId, JoinRequestStatus.PENDING);
      expect(service.listRequests).toHaveBeenCalledWith(
        userId,
        JoinRequestStatus.PENDING,
      );
    });
  });

  describe('decideRequest', () => {
    it('forwards user id, request id and decision from the DTO', () => {
      const out = { id: 'r1', status: JoinRequestStatus.APPROVED };
      service.decideRequest.mockReturnValue(out);

      const result = controller.decideRequest(userId, 'r1', {
        decision: 'APPROVE',
      });

      expect(result).toBe(out);
      expect(service.decideRequest).toHaveBeenCalledWith(
        userId,
        'r1',
        'APPROVE',
      );
    });

    it('forwards a REJECT decision', () => {
      service.decideRequest.mockReturnValue({});
      controller.decideRequest(userId, 'r1', { decision: 'REJECT' });
      expect(service.decideRequest).toHaveBeenCalledWith(
        userId,
        'r1',
        'REJECT',
      );
    });
  });

  describe('listCompanyTrips', () => {
    it('assembles the params object from query args', () => {
      const out = { trips: [], total: 0 };
      service.listCompanyTrips.mockReturnValue(out);

      const result = controller.listCompanyTrips(
        userId,
        TripStatus.COMPLETED,
        'd1',
        '2026-01-01',
        '2026-02-01',
        2,
        20,
      );

      expect(result).toBe(out);
      expect(service.listCompanyTrips).toHaveBeenCalledWith(userId, {
        status: TripStatus.COMPLETED,
        driverId: 'd1',
        from: '2026-01-01',
        to: '2026-02-01',
        page: 2,
        limit: 20,
      });
    });

    it('passes undefined query args through', () => {
      service.listCompanyTrips.mockReturnValue({});
      controller.listCompanyTrips(userId);
      expect(service.listCompanyTrips).toHaveBeenCalledWith(userId, {
        status: undefined,
        driverId: undefined,
        from: undefined,
        to: undefined,
        page: undefined,
        limit: undefined,
      });
    });
  });

  // ---- Transporter side ----
  describe('getMyMembership', () => {
    it('forwards the current user id', () => {
      const out = { company: null, requests: [] };
      service.getMyMembership.mockReturnValue(out);
      expect(controller.getMyMembership(userId)).toBe(out);
      expect(service.getMyMembership).toHaveBeenCalledWith(userId);
    });
  });

  describe('createJoinRequest', () => {
    it('forwards user id and companyId from the DTO', () => {
      const out = { id: 'r1' };
      service.createJoinRequest.mockReturnValue(out);

      const result = controller.createJoinRequest(userId, {
        companyId: 'company-1',
      });

      expect(result).toBe(out);
      expect(service.createJoinRequest).toHaveBeenCalledWith(
        userId,
        'company-1',
      );
    });
  });

  describe('cancelJoinRequest', () => {
    it('forwards user id and request id', () => {
      service.cancelJoinRequest.mockReturnValue({ message: 'ok' });
      controller.cancelJoinRequest(userId, 'r1');
      expect(service.cancelJoinRequest).toHaveBeenCalledWith(userId, 'r1');
    });
  });

  describe('leaveCompany', () => {
    it('forwards the current user id', () => {
      service.leaveCompany.mockReturnValue({ message: 'ok' });
      controller.leaveCompany(userId);
      expect(service.leaveCompany).toHaveBeenCalledWith(userId);
    });
  });
});
