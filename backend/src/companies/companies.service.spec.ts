import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JoinRequestStatus, TripStatus } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: {
    company: { findMany: jest.Mock; findUnique: jest.Mock };
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    companyJoinRequest: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    trip: { findMany: jest.Mock; count: jest.Mock };
    rating: { aggregate: jest.Mock; groupBy: jest.Mock };
    $transaction: jest.Mock;
  };

  // `owner` viene del include de `createJoinRequest`: la empresa de un titular
  // dado de baja no puede aprobar nada, así que no acepta solicitudes.
  const company = {
    id: 'company-1',
    name: 'Acme',
    ownerId: 'owner-1',
    owner: { isActive: true },
  };

  beforeEach(async () => {
    prisma = {
      company: { findMany: jest.fn(), findUnique: jest.fn() },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      companyJoinRequest: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      trip: { findMany: jest.fn(), count: jest.fn() },
      rating: { aggregate: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      // Default: execute the callback with a tx that mirrors prisma.
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  // ------------------------------------------------------------------
  // listCompanies
  // ------------------------------------------------------------------
  describe('listCompanies', () => {
    it('returns the company directory ordered by name', async () => {
      const dir = [{ id: 'c1', name: 'Acme', _count: { members: 3 } }];
      prisma.company.findMany.mockResolvedValue(dir);

      const result = await service.listCompanies();

      expect(result).toBe(dir);
      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });

    // Todo lo que administra una empresa se resuelve por su titular: si se dio de
    // baja, la empresa no puede aprobar ni rechazar nada.
    it('hides companies whose owner is no longer active', async () => {
      prisma.company.findMany.mockResolvedValue([]);

      await service.listCompanies();

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { owner: { isActive: true } } }),
      );
    });
  });

  // ------------------------------------------------------------------
  // getMyMembership
  // ------------------------------------------------------------------
  describe('getMyMembership', () => {
    it('returns the current company and request history', async () => {
      const userCompany = { id: 'company-1', name: 'Acme' };
      const requests = [{ id: 'r1', status: JoinRequestStatus.PENDING }];
      prisma.user.findUnique.mockResolvedValue({ company: userCompany });
      prisma.companyJoinRequest.findMany.mockResolvedValue(requests);

      const result = await service.getMyMembership('driver-1');

      expect(result).toEqual({ company: userCompany, requests });
      expect(prisma.companyJoinRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transporterId: 'driver-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('returns null company when the user has no company', async () => {
      prisma.user.findUnique.mockResolvedValue({ company: null });
      prisma.companyJoinRequest.findMany.mockResolvedValue([]);

      const result = await service.getMyMembership('driver-1');

      expect(result.company).toBeNull();
    });

    it('returns null company when the user is not found at all', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.companyJoinRequest.findMany.mockResolvedValue([]);

      const result = await service.getMyMembership('ghost');

      expect(result.company).toBeNull();
      expect(result.requests).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // createJoinRequest
  // ------------------------------------------------------------------
  describe('createJoinRequest', () => {
    it('creates a new join request for a free transporter', async () => {
      const created = { id: 'r1', status: JoinRequestStatus.PENDING };
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue({ companyId: null });
      prisma.companyJoinRequest.findUnique.mockResolvedValue(null);
      prisma.companyJoinRequest.upsert.mockResolvedValue(created);

      const result = await service.createJoinRequest('driver-1', 'company-1');

      expect(result).toBe(created);
      expect(prisma.companyJoinRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId_transporterId: {
              companyId: 'company-1',
              transporterId: 'driver-1',
            },
          },
          create: { companyId: 'company-1', transporterId: 'driver-1' },
          update: { status: JoinRequestStatus.PENDING, decidedAt: null },
        }),
      );
    });

    it('re-applies (upsert) when a previous request was REJECTED', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue({ companyId: null });
      prisma.companyJoinRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: JoinRequestStatus.REJECTED,
      });
      prisma.companyJoinRequest.upsert.mockResolvedValue({ id: 'r1' });

      await service.createJoinRequest('driver-1', 'company-1');

      expect(prisma.companyJoinRequest.upsert).toHaveBeenCalled();
    });

    it('throws NotFoundException when the company does not exist', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.createJoinRequest('driver-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.companyJoinRequest.upsert).not.toHaveBeenCalled();
    });

    it('refuses to join a company whose owner deleted their account', async () => {
      prisma.company.findUnique.mockResolvedValue({
        ...company,
        owner: { isActive: false },
      });

      await expect(
        service.createJoinRequest('driver-1', 'company-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.companyJoinRequest.upsert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the transporter already belongs to a company', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue({ companyId: 'other-co' });

      await expect(
        service.createJoinRequest('driver-1', 'company-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.companyJoinRequest.upsert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a PENDING request already exists', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue({ companyId: null });
      prisma.companyJoinRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: JoinRequestStatus.PENDING,
      });

      await expect(
        service.createJoinRequest('driver-1', 'company-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.companyJoinRequest.upsert).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // cancelJoinRequest
  // ------------------------------------------------------------------
  describe('cancelJoinRequest', () => {
    it('deletes a pending request owned by the transporter', async () => {
      prisma.companyJoinRequest.findUnique.mockResolvedValue({
        id: 'r1',
        transporterId: 'driver-1',
        status: JoinRequestStatus.PENDING,
      });
      prisma.companyJoinRequest.delete.mockResolvedValue({});

      const result = await service.cancelJoinRequest('driver-1', 'r1');

      expect(prisma.companyJoinRequest.delete).toHaveBeenCalledWith({
        where: { id: 'r1' },
      });
      expect(result).toEqual({ message: 'Solicitud cancelada' });
    });

    it('throws NotFoundException when the request does not exist', async () => {
      prisma.companyJoinRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelJoinRequest('driver-1', 'r1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the request belongs to another transporter', async () => {
      prisma.companyJoinRequest.findUnique.mockResolvedValue({
        id: 'r1',
        transporterId: 'someone-else',
        status: JoinRequestStatus.PENDING,
      });

      await expect(
        service.cancelJoinRequest('driver-1', 'r1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.companyJoinRequest.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the request is already resolved', async () => {
      prisma.companyJoinRequest.findUnique.mockResolvedValue({
        id: 'r1',
        transporterId: 'driver-1',
        status: JoinRequestStatus.APPROVED,
      });

      await expect(
        service.cancelJoinRequest('driver-1', 'r1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.companyJoinRequest.delete).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // leaveCompany
  // ------------------------------------------------------------------
  describe('leaveCompany', () => {
    it('detaches the transporter from the company', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 'company-1' });
      prisma.user.update.mockResolvedValue({});

      const result = await service.leaveCompany('driver-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { companyId: null },
      });
      expect(result).toEqual({ message: 'Saliste de la empresa' });
    });

    it('throws BadRequestException when the user has no company', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: null });

      await expect(service.leaveCompany('driver-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.leaveCompany('ghost')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ------------------------------------------------------------------
  // getMyCompany (exercises private getOwnedCompany)
  // ------------------------------------------------------------------
  describe('getMyCompany', () => {
    it('returns the owned company with member and pending counts', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.count.mockResolvedValue(5);
      prisma.companyJoinRequest.count.mockResolvedValue(2);

      const result = await service.getMyCompany('owner-1');

      expect(result).toEqual({
        ...company,
        memberCount: 5,
        pendingRequests: 2,
      });
      expect(prisma.companyJoinRequest.count).toHaveBeenCalledWith({
        where: {
          companyId: company.id,
          status: JoinRequestStatus.PENDING,
        },
      });
    });

    it('throws NotFoundException when the user owns no company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.getMyCompany('not-owner')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ------------------------------------------------------------------
  // listDrivers
  // ------------------------------------------------------------------
  describe('listDrivers', () => {
    it('lists drivers of the owned company', async () => {
      const drivers = [{ id: 'd1', firstName: 'Ana' }];
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findMany.mockResolvedValue(drivers);

      const result = await service.listDrivers('owner-1');

      expect(result).toBe(drivers);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: company.id } }),
      );
    });

    it('throws NotFoundException when there is no owned company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.listDrivers('x')).rejects.toThrow(NotFoundException);
    });
  });

  // ------------------------------------------------------------------
  // removeDriver
  // ------------------------------------------------------------------
  describe('removeDriver', () => {
    it('removes a driver that belongs to the company', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue({ companyId: 'company-1' });
      prisma.user.update.mockResolvedValue({});

      const result = await service.removeDriver('owner-1', 'd1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { companyId: null },
      });
      expect(result).toEqual({ message: 'Conductor removido de la empresa' });
    });

    it('throws NotFoundException when the owned company is missing', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.removeDriver('x', 'd1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the driver does not exist', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.removeDriver('owner-1', 'd1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the driver belongs to a different company', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue({ companyId: 'other-co' });

      await expect(service.removeDriver('owner-1', 'd1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // listRequests
  // ------------------------------------------------------------------
  describe('listRequests', () => {
    it('lists all requests for the company when no status filter is given', async () => {
      const requests = [{ id: 'r1' }];
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findMany.mockResolvedValue(requests);

      const result = await service.listRequests('owner-1');

      expect(result).toBe(requests);
      expect(prisma.companyJoinRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: company.id } }),
      );
    });

    it('applies the status filter when provided', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findMany.mockResolvedValue([]);

      await service.listRequests('owner-1', JoinRequestStatus.PENDING);

      expect(prisma.companyJoinRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: company.id,
            status: JoinRequestStatus.PENDING,
          },
        }),
      );
    });

    it('throws NotFoundException when there is no owned company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.listRequests('x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ------------------------------------------------------------------
  // decideRequest — approval/rejection state machine + authorization
  // ------------------------------------------------------------------
  describe('decideRequest', () => {
    const pendingRequest = {
      id: 'r1',
      companyId: 'company-1',
      transporterId: 'driver-1',
      status: JoinRequestStatus.PENDING,
    };

    it('rejects a pending request', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findUnique.mockResolvedValue(pendingRequest);
      const updated = { ...pendingRequest, status: JoinRequestStatus.REJECTED };
      prisma.companyJoinRequest.update.mockResolvedValue(updated);

      const result = await service.decideRequest('owner-1', 'r1', 'REJECT');

      expect(result).toBe(updated);
      expect(prisma.companyJoinRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({
            status: JoinRequestStatus.REJECTED,
          }),
        }),
      );
      // Reject must NOT touch the user or open a transaction.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('approves a pending request: assigns user and marks APPROVED in a transaction', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findUnique.mockResolvedValue(pendingRequest);
      prisma.user.findUnique.mockResolvedValue({ companyId: null });
      prisma.user.update.mockResolvedValue({});
      const approved = { ...pendingRequest, status: JoinRequestStatus.APPROVED };
      prisma.companyJoinRequest.update.mockResolvedValue(approved);

      const result = await service.decideRequest('owner-1', 'r1', 'APPROVE');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { companyId: 'company-1' },
      });
      expect(prisma.companyJoinRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JoinRequestStatus.APPROVED,
          }),
        }),
      );
      expect(result).toBe(approved);
    });

    it('throws NotFoundException when the owned company is missing', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(
        service.decideRequest('x', 'r1', 'APPROVE'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the request does not exist', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.decideRequest('owner-1', 'r1', 'APPROVE'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the request belongs to another company (authorization scope)', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findUnique.mockResolvedValue({
        ...pendingRequest,
        companyId: 'other-co',
      });

      await expect(
        service.decideRequest('owner-1', 'r1', 'APPROVE'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the request is already resolved', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findUnique.mockResolvedValue({
        ...pendingRequest,
        status: JoinRequestStatus.APPROVED,
      });

      await expect(
        service.decideRequest('owner-1', 'r1', 'APPROVE'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on APPROVE when the transporter already joined another company', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.companyJoinRequest.findUnique.mockResolvedValue(pendingRequest);
      prisma.user.findUnique.mockResolvedValue({ companyId: 'other-co' });

      await expect(
        service.decideRequest('owner-1', 'r1', 'APPROVE'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // listCompanyTrips
  // ------------------------------------------------------------------
  describe('listCompanyTrips', () => {
    it('returns paginated trips with defaults when no params are given', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      const trips = [{ id: 't1' }];
      prisma.trip.findMany.mockResolvedValue(trips);
      prisma.trip.count.mockResolvedValue(1);

      const result = await service.listCompanyTrips('owner-1', {});

      expect(result).toEqual({
        trips,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { carrier: { companyId: company.id } },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('applies status, driver, date filters and pagination', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(45);

      const result = await service.listCompanyTrips('owner-1', {
        status: TripStatus.COMPLETED,
        driverId: 'd1',
        from: '2026-01-01',
        to: '2026-02-01',
        page: 2,
        limit: 20,
      });

      expect(result.totalPages).toBe(Math.ceil(45 / 20));
      expect(result.page).toBe(2);
      const callArg = prisma.trip.findMany.mock.calls[0][0];
      expect(callArg.skip).toBe(20);
      expect(callArg.where.carrierId).toBe('d1');
      expect(callArg.where.status).toBe(TripStatus.COMPLETED);
      expect(callArg.where.createdAt.gte).toBeInstanceOf(Date);
      expect(callArg.where.createdAt.lte).toBeInstanceOf(Date);
    });

    it('only sets the gte bound when only "from" is given', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.listCompanyTrips('owner-1', { from: '2026-01-01' });

      const callArg = prisma.trip.findMany.mock.calls[0][0];
      expect(callArg.where.createdAt.gte).toBeInstanceOf(Date);
      expect(callArg.where.createdAt.lte).toBeUndefined();
    });

    it('throws NotFoundException when the owned company is missing', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.listCompanyTrips('x', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ------------------------------------------------------------------
  // getDriverStats
  // ------------------------------------------------------------------
  describe('getDriverStats', () => {
    const driver = {
      id: 'd1',
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@x.com',
      phone: null,
      avatarUrl: null,
      companyId: 'company-1',
    };

    it('aggregates trip and rating stats for a company driver', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue(driver);
      prisma.trip.findMany.mockResolvedValue([
        {
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-01-10'),
          fuelLiters: 100,
          distanceKm: 500,
          load: { price: 1000, deliveryDate: new Date('2026-01-15'), postulations: [] },
        },
        {
          status: TripStatus.IN_PROGRESS,
          completedAt: null,
          fuelLiters: null,
          distanceKm: null,
          load: { price: 200, deliveryDate: null, postulations: [] },
        },
      ]);
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 4.5 },
        _count: { score: 8 },
      });

      const result = await service.getDriverStats('owner-1', 'd1');

      expect(result.totalTrips).toBe(2);
      expect(result.completedTrips).toBe(1);
      expect(result.activeTrips).toBe(1);
      expect(result.totalRevenue).toBe(1000);
      expect(result.avgRating).toBe(4.5);
      expect(result.ratingsCount).toBe(8);
      // metrics spread in
      expect(result).toHaveProperty('onTimeRate');
      expect(result).toHaveProperty('avgKmPerLiter');
      // companyId must be stripped from driver info
      expect(result.driver).not.toHaveProperty('companyId');
      expect(result.driver.id).toBe('d1');
    });

    it('bills a load published without a price at the agreed postulation price', async () => {
      // Carga "a convenir": el precio pactado vive solo en la postulación
      // aceptada. Tomar load.price la contaría como $0 de ingresos.
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue(driver);
      prisma.trip.findMany.mockResolvedValue([
        {
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-01-10'),
          fuelLiters: null,
          distanceKm: null,
          load: { price: null, deliveryDate: null, postulations: [{ proposedPrice: 7500 }] },
        },
      ]);
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: { score: 0 },
      });

      const result = await service.getDriverStats('owner-1', 'd1');

      expect(result.totalRevenue).toBe(7500);
    });

    it('prefers the negotiated price over the listed one', async () => {
      // El transportista negoció por encima del precio publicado: el ingreso
      // real es el pactado, no el que se listó al publicar.
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue(driver);
      prisma.trip.findMany.mockResolvedValue([
        {
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-01-10'),
          fuelLiters: null,
          distanceKm: null,
          load: { price: 1000, deliveryDate: null, postulations: [{ proposedPrice: 1300 }] },
        },
      ]);
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: { score: 0 },
      });

      const result = await service.getDriverStats('owner-1', 'd1');

      expect(result.totalRevenue).toBe(1300);
    });

    it('falls back to the listed price when the carrier proposed none', async () => {
      // Postularse sin precio significa "acepto el publicado".
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue(driver);
      prisma.trip.findMany.mockResolvedValue([
        {
          status: TripStatus.COMPLETED,
          completedAt: new Date('2026-01-10'),
          fuelLiters: null,
          distanceKm: null,
          load: { price: 900, deliveryDate: null, postulations: [{ proposedPrice: null }] },
        },
      ]);
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: { score: 0 },
      });

      const result = await service.getDriverStats('owner-1', 'd1');

      expect(result.totalRevenue).toBe(900);
    });

    it('handles a driver with no trips (null avg rating, zeroed totals)', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue(driver);
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: { score: 0 },
      });

      const result = await service.getDriverStats('owner-1', 'd1');

      expect(result.totalTrips).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.avgRating).toBeNull();
    });

    it('throws NotFoundException when the owned company is missing', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.getDriverStats('x', 'd1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the driver does not exist', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getDriverStats('owner-1', 'd1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the driver belongs to another company', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findUnique.mockResolvedValue({
        ...driver,
        companyId: 'other-co',
      });

      await expect(service.getDriverStats('owner-1', 'd1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ------------------------------------------------------------------
  // getCompanyMetrics
  // ------------------------------------------------------------------
  describe('getCompanyMetrics', () => {
    const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3_600_000);

    const driver = (id: string, firstName: string) => ({
      id,
      firstName,
      lastName: 'Perez',
      email: `${id}@x.com`,
      phone: null,
      avatarUrl: null,
    });

    it('returns an empty report when the company has no drivers', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.getCompanyMetrics('owner-1');

      expect(result.driverCount).toBe(0);
      expect(result.utilizationRate).toBeNull();
      expect(result.totalAmount).toBe(0);
      expect(result.driverRanking).toEqual([]);
      expect(result.monthly).toHaveLength(12);
      // Sin conductores no vale la pena ir a buscar viajes ni calificaciones.
      expect(prisma.trip.findMany).not.toHaveBeenCalled();
    });

    it('aggregates the fleet and ranks drivers by revenue', async () => {
      prisma.company.findUnique.mockResolvedValue(company);
      prisma.user.findMany.mockResolvedValue([driver('d1', 'Ana'), driver('d2', 'Beto')]);
      prisma.trip.findMany.mockResolvedValue([
        {
          carrierId: 'd1',
          status: TripStatus.COMPLETED,
          completedAt: daysAgo(2),
          fuelLiters: 100,
          distanceKm: 500,
          load: {
            deliveryDate: daysAgo(1), // entregó antes de la fecha comprometida
            price: 1000,
            postulations: [{ proposedPrice: 2000 }],
          },
        },
        {
          carrierId: 'd1',
          status: TripStatus.IN_PROGRESS,
          completedAt: null,
          fuelLiters: null,
          distanceKm: null,
          load: { deliveryDate: null, price: 900, postulations: [] },
        },
        // d2 no maneja hace más de un mes: flota subutilizada.
        {
          carrierId: 'd2',
          status: TripStatus.COMPLETED,
          completedAt: daysAgo(60),
          fuelLiters: 20,
          distanceKm: 100,
          load: { deliveryDate: null, price: 500, postulations: [] },
        },
      ]);
      prisma.rating.groupBy.mockResolvedValue([
        { toUserId: 'd1', _avg: { score: 4.5 }, _count: { score: 8 } },
      ]);

      const result = await service.getCompanyMetrics('owner-1');

      expect(result.driverCount).toBe(2);
      expect(result.totalTrips).toBe(3);
      expect(result.completedTrips).toBe(2);
      expect(result.activeTrips).toBe(1);
      // 2000 (precio pactado en la postulación) + 500 (precio publicado).
      expect(result.totalAmount).toBe(2500);
      expect(result.totalDistanceKm).toBe(600);
      expect(result.avgKmPerLiter).toBe(5); // 600 km / 120 L
      expect(result.activeDriverCount).toBe(1);
      expect(result.utilizationRate).toBe(0.5);
      expect(result.idleDriverCount).toBe(1);

      const [top, second] = result.driverRanking;
      expect(top.id).toBe('d1');
      expect(top.name).toBe('Ana Perez');
      expect(top.totalAmount).toBe(2000);
      expect(top.activeTrips).toBe(1);
      expect(top.onTimeRate).toBe(1);
      expect(top.avgRating).toBe(4.5);
      expect(top.ratingsCount).toBe(8);
      expect(top.idle).toBe(false);

      expect(second.id).toBe('d2');
      expect(second.totalAmount).toBe(500);
      expect(second.avgRating).toBeNull();
      expect(second.ratingsCount).toBe(0);
      expect(second.idle).toBe(true);
    });

    it('throws NotFoundException when the user owns no company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.getCompanyMetrics('owner-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
