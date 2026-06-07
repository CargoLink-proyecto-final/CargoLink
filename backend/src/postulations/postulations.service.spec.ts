import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { LoadStatus, PostulationStatus, TripStatus } from '@prisma/client';
import { PostulationsService } from './postulations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PostulationsService', () => {
  let service: PostulationsService;
  let prisma: {
    load: { findUnique: jest.Mock; update: jest.Mock };
    postulation: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    rating: { groupBy: jest.Mock };
    trip: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  const SHIPPER_ID = 'shipper-1';
  const TRANSPORTER_ID = 'transporter-1';
  const OTHER_USER = 'other-1';

  const baseLoad = {
    id: 'load-1',
    shipperId: SHIPPER_ID,
    price: 100000,
    status: LoadStatus.PUBLISHED,
  };

  const basePostulation = {
    id: 'post-1',
    loadId: 'load-1',
    transporterId: TRANSPORTER_ID,
    status: PostulationStatus.PENDING,
    message: null,
    proposedPrice: null,
    counterOfferPrice: null,
    lastOfferBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    load: baseLoad,
  };

  beforeEach(async () => {
    prisma = {
      load: { findUnique: jest.fn(), update: jest.fn() },
      postulation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      rating: { groupBy: jest.fn() },
      trip: { create: jest.fn() },
      // Default: run the callback against a tx mirror of prisma so the
      // transactional methods are exercised. Individual tests can override.
      $transaction: jest.fn(),
    };

    // Provide a tx that mirrors the prisma mock for $transaction(cb) usage.
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        postulation: {
          update: prisma.postulation.update,
          updateMany: prisma.postulation.updateMany,
        },
        load: { update: prisma.load.update },
        trip: { create: prisma.trip.create },
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostulationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PostulationsService>(PostulationsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('creates a new postulation on the happy path (no proposed price)', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findUnique.mockResolvedValue(null);
      prisma.postulation.create.mockResolvedValue({ id: 'new-post' });

      const result = await service.create('load-1', TRANSPORTER_ID, {
        message: 'hola',
      });

      expect(prisma.postulation.create).toHaveBeenCalledWith({
        data: {
          loadId: 'load-1',
          transporterId: TRANSPORTER_ID,
          message: 'hola',
          proposedPrice: undefined,
        },
      });
      expect(result).toEqual({ id: 'new-post' });
    });

    it('creates with a proposed price greater than the listed price', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findUnique.mockResolvedValue(null);
      prisma.postulation.create.mockResolvedValue({ id: 'new-post' });

      await service.create('load-1', TRANSPORTER_ID, { proposedPrice: 120000 });

      expect(prisma.postulation.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when the load does not exist', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await expect(
        service.create('load-1', TRANSPORTER_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the load is not PUBLISHED', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...baseLoad,
        status: LoadStatus.ASSIGNED,
      });
      await expect(
        service.create('load-1', TRANSPORTER_ID, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when postulating to your own load', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      await expect(
        service.create('load-1', SHIPPER_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when proposed price <= listed price', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      await expect(
        service.create('load-1', TRANSPORTER_ID, { proposedPrice: 100000 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('load-1', TRANSPORTER_ID, { proposedPrice: 50000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when an active postulation already exists', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.PENDING,
      });
      await expect(
        service.create('load-1', TRANSPORTER_ID, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('re-activates a WITHDRAWN postulation back to PENDING', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.WITHDRAWN,
      });
      prisma.postulation.update.mockResolvedValue({ id: 'post-1', status: 'PENDING' });

      await service.create('load-1', TRANSPORTER_ID, {
        message: 'de nuevo',
        proposedPrice: 130000,
      });

      expect(prisma.postulation.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: {
          status: PostulationStatus.PENDING,
          message: 'de nuevo',
          proposedPrice: 130000,
          counterOfferPrice: null,
          lastOfferBy: null,
        },
      });
      expect(prisma.postulation.create).not.toHaveBeenCalled();
    });

    it('normalizes missing fields to null when reactivating a WITHDRAWN postulation', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.WITHDRAWN,
      });
      prisma.postulation.update.mockResolvedValue({ id: 'post-1' });

      await service.create('load-1', TRANSPORTER_ID, {});

      expect(prisma.postulation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ message: null, proposedPrice: null }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // listForLoad
  // ---------------------------------------------------------------------------
  describe('listForLoad', () => {
    it('throws NotFoundException when the load does not exist', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await expect(
        service.listForLoad('load-1', SHIPPER_ID, 'CARGO_GENERATOR'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a non-owner non-admin requests', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      await expect(
        service.listForLoad('load-1', OTHER_USER, 'TRANSPORTER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns an empty array when there are no postulations', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findMany.mockResolvedValue([]);
      const result = await service.listForLoad('load-1', SHIPPER_ID, 'CARGO_GENERATOR');
      expect(result).toEqual([]);
      expect(prisma.rating.groupBy).not.toHaveBeenCalled();
    });

    it('allows ADMIN to view postulations of any load', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findMany.mockResolvedValue([]);
      const result = await service.listForLoad('load-1', OTHER_USER, 'ADMIN');
      expect(result).toEqual([]);
    });

    it('enriches with ratings and sorts by avg rating desc then createdAt asc', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      const p1 = {
        id: 'p1',
        transporterId: 't1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      const p2 = {
        id: 'p2',
        transporterId: 't2',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      };
      const p3 = {
        id: 'p3',
        transporterId: 't3',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      };
      prisma.postulation.findMany.mockResolvedValue([p1, p2, p3]);
      prisma.rating.groupBy.mockResolvedValue([
        { toUserId: 't1', _avg: { score: 4.25 }, _count: { _all: 4 } },
        { toUserId: 't2', _avg: { score: 4.9 }, _count: { _all: 2 } },
        // t3 has no ratings
      ]);

      const result = await service.listForLoad('load-1', SHIPPER_ID, 'CARGO_GENERATOR');

      // t2 (4.9) first, then t1 (4.3 rounded), then t3 (0)
      expect(result.map((r) => r.id)).toEqual(['p2', 'p1', 'p3']);
      expect(result[0].averageRating).toBe(4.9);
      expect(result[0].totalRatings).toBe(2);
      // 4.25 rounded to 1 decimal => 4.3
      expect(result[1].averageRating).toBe(4.3);
      // unrated => 0
      expect(result[2].averageRating).toBe(0);
      expect(result[2].totalRatings).toBe(0);
    });

    it('handles a null avg score from groupBy as rating 0', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      prisma.postulation.findMany.mockResolvedValue([
        { id: 'p1', transporterId: 't1', createdAt: new Date('2026-01-01T00:00:00Z') },
      ]);
      prisma.rating.groupBy.mockResolvedValue([
        { toUserId: 't1', _avg: { score: null }, _count: { _all: 0 } },
      ]);
      const result = await service.listForLoad('load-1', SHIPPER_ID, 'CARGO_GENERATOR');
      expect(result[0].averageRating).toBe(0);
    });

    it('sorts equal-rated postulations by createdAt ascending', async () => {
      prisma.load.findUnique.mockResolvedValue(baseLoad);
      const early = {
        id: 'early',
        transporterId: 't1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      const late = {
        id: 'late',
        transporterId: 't2',
        createdAt: new Date('2026-01-05T00:00:00Z'),
      };
      prisma.postulation.findMany.mockResolvedValue([late, early]);
      prisma.rating.groupBy.mockResolvedValue([
        { toUserId: 't1', _avg: { score: 4 }, _count: { _all: 1 } },
        { toUserId: 't2', _avg: { score: 4 }, _count: { _all: 1 } },
      ]);
      const result = await service.listForLoad('load-1', SHIPPER_ID, 'CARGO_GENERATOR');
      expect(result.map((r) => r.id)).toEqual(['early', 'late']);
    });
  });

  // ---------------------------------------------------------------------------
  // listMine
  // ---------------------------------------------------------------------------
  describe('listMine', () => {
    it('queries by transporterId without status filter', async () => {
      prisma.postulation.findMany.mockResolvedValue([{ id: 'p1' }]);
      const result = await service.listMine(TRANSPORTER_ID);
      expect(prisma.postulation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transporterId: TRANSPORTER_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'p1' }]);
    });

    it('applies a status filter when provided', async () => {
      prisma.postulation.findMany.mockResolvedValue([]);
      await service.listMine(TRANSPORTER_ID, PostulationStatus.ACCEPTED);
      expect(prisma.postulation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transporterId: TRANSPORTER_ID, status: PostulationStatus.ACCEPTED },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // accept
  // ---------------------------------------------------------------------------
  describe('accept', () => {
    it('throws NotFoundException when the postulation does not exist', async () => {
      prisma.postulation.findUnique.mockResolvedValue(null);
      await expect(service.accept('post-1', SHIPPER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the user is not the load owner', async () => {
      prisma.postulation.findUnique.mockResolvedValue(basePostulation);
      await expect(service.accept('post-1', OTHER_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the postulation is not PENDING/NEGOTIATING', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.REJECTED,
      });
      await expect(service.accept('post-1', SHIPPER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the load is no longer PUBLISHED', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        load: { ...baseLoad, status: LoadStatus.ASSIGNED },
      });
      await expect(service.accept('post-1', SHIPPER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when negotiating and shipper made the last offer', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.NEGOTIATING,
        lastOfferBy: 'SHIPPER',
        counterOfferPrice: 90000,
      });
      await expect(service.accept('post-1', SHIPPER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts a PENDING postulation: uses proposedPrice, rejects others, assigns load, creates trip', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.PENDING,
        proposedPrice: 120000,
      });
      prisma.postulation.update.mockResolvedValue({ id: 'post-1', status: 'ACCEPTED' });
      prisma.postulation.updateMany.mockResolvedValue({ count: 2 });
      prisma.load.update.mockResolvedValue({});
      prisma.trip.create.mockResolvedValue({ id: 'trip-1' });

      const result = await service.accept('post-1', SHIPPER_ID);

      expect(prisma.postulation.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: {
          status: PostulationStatus.ACCEPTED,
          proposedPrice: 120000,
          counterOfferPrice: null,
          lastOfferBy: null,
        },
      });
      expect(prisma.postulation.updateMany).toHaveBeenCalledWith({
        where: {
          loadId: 'load-1',
          id: { not: 'post-1' },
          status: { in: [PostulationStatus.PENDING, PostulationStatus.NEGOTIATING] },
        },
        data: { status: PostulationStatus.REJECTED },
      });
      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 'load-1' },
        data: { status: LoadStatus.ASSIGNED },
      });
      expect(prisma.trip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            loadId: 'load-1',
            carrierId: TRANSPORTER_ID,
            status: TripStatus.ACCEPTED,
          },
        }),
      );
      expect(result).toEqual({
        postulation: { id: 'post-1', status: 'ACCEPTED' },
        trip: { id: 'trip-1' },
      });
    });

    it('accepts a NEGOTIATING postulation where transporter made the last offer (uses counterOfferPrice)', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.NEGOTIATING,
        lastOfferBy: 'TRANSPORTER',
        proposedPrice: 130000,
        counterOfferPrice: 125000,
      });
      prisma.postulation.update.mockResolvedValue({ id: 'post-1' });
      prisma.postulation.updateMany.mockResolvedValue({ count: 0 });
      prisma.load.update.mockResolvedValue({});
      prisma.trip.create.mockResolvedValue({ id: 'trip-1' });

      await service.accept('post-1', SHIPPER_ID);

      expect(prisma.postulation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ proposedPrice: 125000 }),
        }),
      );
    });

    it('falls back to proposedPrice when negotiating but counterOfferPrice is null', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.NEGOTIATING,
        lastOfferBy: 'TRANSPORTER',
        proposedPrice: 130000,
        counterOfferPrice: null,
      });
      prisma.postulation.update.mockResolvedValue({ id: 'post-1' });
      prisma.postulation.updateMany.mockResolvedValue({ count: 0 });
      prisma.load.update.mockResolvedValue({});
      prisma.trip.create.mockResolvedValue({ id: 'trip-1' });

      await service.accept('post-1', SHIPPER_ID);

      expect(prisma.postulation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ proposedPrice: 130000 }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // counterOffer
  // ---------------------------------------------------------------------------
  describe('counterOffer', () => {
    it('throws NotFoundException when the postulation does not exist', async () => {
      prisma.postulation.findUnique.mockResolvedValue(null);
      await expect(
        service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 90000 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when status is not PENDING/NEGOTIATING', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.ACCEPTED,
      });
      await expect(
        service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 90000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the load is no longer PUBLISHED', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        proposedPrice: 120000,
        load: { ...baseLoad, status: LoadStatus.ASSIGNED },
      });
      await expect(
        service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 90000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user is neither the shipper nor the transporter', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        proposedPrice: 120000,
      });
      await expect(
        service.counterOffer('post-1', OTHER_USER, 'CARGO_GENERATOR', { price: 90000 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when role does not match relationship (transporter id matches but role is shipper)', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        proposedPrice: 120000,
      });
      // userId is the transporter but role claims CARGO_GENERATOR -> not the shipper of load
      await expect(
        service.counterOffer('post-1', TRANSPORTER_ID, 'CARGO_GENERATOR', { price: 90000 }),
      ).rejects.toThrow(ForbiddenException);
    });

    describe('shipper countering', () => {
      it('shipper counters a PENDING postulation below the transporter proposed price', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.PENDING,
          proposedPrice: 120000,
        });
        prisma.postulation.update.mockResolvedValue({ id: 'post-1' });

        await service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', {
          price: 110000,
        });

        expect(prisma.postulation.update).toHaveBeenCalledWith({
          where: { id: 'post-1' },
          data: {
            counterOfferPrice: 110000,
            lastOfferBy: 'SHIPPER',
            status: PostulationStatus.NEGOTIATING,
          },
        });
      });

      it('blocks shipper from countering twice in a row', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.NEGOTIATING,
          lastOfferBy: 'SHIPPER',
          proposedPrice: 120000,
          counterOfferPrice: 110000,
        });
        await expect(
          service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 105000 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws when the transporter never proposed a price (nothing to negotiate)', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.PENDING,
          proposedPrice: null,
        });
        await expect(
          service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 90000 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws when shipper counter >= the transporter asking price', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.PENDING,
          proposedPrice: 120000,
        });
        await expect(
          service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 120000 }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 130000 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('uses the transporter counter as the ceiling when transporter made the last offer', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.NEGOTIATING,
          lastOfferBy: 'TRANSPORTER',
          proposedPrice: 120000,
          counterOfferPrice: 115000,
        });
        prisma.postulation.update.mockResolvedValue({ id: 'post-1' });

        // 114000 < 115000 (transporter counter) -> ok
        await service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', {
          price: 114000,
        });
        expect(prisma.postulation.update).toHaveBeenCalled();

        // >= 115000 blocked
        await expect(
          service.counterOffer('post-1', SHIPPER_ID, 'CARGO_GENERATOR', { price: 115000 }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('transporter countering', () => {
      it('blocks transporter from countering their own initial PENDING offer', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.PENDING,
          proposedPrice: 120000,
        });
        await expect(
          service.counterOffer('post-1', TRANSPORTER_ID, 'TRANSPORTER', { price: 130000 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('blocks transporter from countering twice in a row', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.NEGOTIATING,
          lastOfferBy: 'TRANSPORTER',
          proposedPrice: 120000,
          counterOfferPrice: 118000,
        });
        await expect(
          service.counterOffer('post-1', TRANSPORTER_ID, 'TRANSPORTER', { price: 119000 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('transporter counters after a shipper offer, above the shipper floor', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.NEGOTIATING,
          lastOfferBy: 'SHIPPER',
          proposedPrice: 120000,
          counterOfferPrice: 110000,
        });
        prisma.postulation.update.mockResolvedValue({ id: 'post-1' });

        await service.counterOffer('post-1', TRANSPORTER_ID, 'TRANSPORTER', {
          price: 115000,
        });

        expect(prisma.postulation.update).toHaveBeenCalledWith({
          where: { id: 'post-1' },
          data: {
            counterOfferPrice: 115000,
            lastOfferBy: 'TRANSPORTER',
            status: PostulationStatus.NEGOTIATING,
          },
        });
      });

      it('throws when transporter counter <= the shipper counter floor', async () => {
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.NEGOTIATING,
          lastOfferBy: 'SHIPPER',
          proposedPrice: 120000,
          counterOfferPrice: 110000,
        });
        await expect(
          service.counterOffer('post-1', TRANSPORTER_ID, 'TRANSPORTER', { price: 110000 }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.counterOffer('post-1', TRANSPORTER_ID, 'TRANSPORTER', { price: 100000 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('uses the listed price as the floor when there is no shipper counter yet', async () => {
        // NEGOTIATING with lastOfferBy SHIPPER but counterOfferPrice null is an
        // odd state; the floor falls back to load.price (100000).
        prisma.postulation.findUnique.mockResolvedValue({
          ...basePostulation,
          status: PostulationStatus.NEGOTIATING,
          lastOfferBy: 'SHIPPER',
          proposedPrice: 120000,
          counterOfferPrice: null,
        });
        prisma.postulation.update.mockResolvedValue({ id: 'post-1' });

        // 101000 > 100000 listed -> ok
        await service.counterOffer('post-1', TRANSPORTER_ID, 'TRANSPORTER', {
          price: 101000,
        });
        expect(prisma.postulation.update).toHaveBeenCalled();

        // <= listed price blocked
        await expect(
          service.counterOffer('post-1', TRANSPORTER_ID, 'TRANSPORTER', { price: 100000 }),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // acceptOffer
  // ---------------------------------------------------------------------------
  describe('acceptOffer', () => {
    const negotiatingByShipper = {
      ...basePostulation,
      status: PostulationStatus.NEGOTIATING,
      lastOfferBy: 'SHIPPER',
      proposedPrice: 120000,
      counterOfferPrice: 110000,
    };

    it('throws NotFoundException when the postulation does not exist', async () => {
      prisma.postulation.findUnique.mockResolvedValue(null);
      await expect(service.acceptOffer('post-1', TRANSPORTER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when not the transporter of the postulation', async () => {
      prisma.postulation.findUnique.mockResolvedValue(negotiatingByShipper);
      await expect(service.acceptOffer('post-1', OTHER_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when status is not NEGOTIATING', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...negotiatingByShipper,
        status: PostulationStatus.PENDING,
      });
      await expect(service.acceptOffer('post-1', TRANSPORTER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the last offer was not from the shipper', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...negotiatingByShipper,
        lastOfferBy: 'TRANSPORTER',
      });
      await expect(service.acceptOffer('post-1', TRANSPORTER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the load is no longer PUBLISHED', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...negotiatingByShipper,
        load: { ...baseLoad, status: LoadStatus.ASSIGNED },
      });
      await expect(service.acceptOffer('post-1', TRANSPORTER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts the shipper counter-offer: sets price, rejects others, assigns load, creates trip', async () => {
      prisma.postulation.findUnique.mockResolvedValue(negotiatingByShipper);
      prisma.postulation.update.mockResolvedValue({ id: 'post-1', status: 'ACCEPTED' });
      prisma.postulation.updateMany.mockResolvedValue({ count: 1 });
      prisma.load.update.mockResolvedValue({});
      prisma.trip.create.mockResolvedValue({ id: 'trip-1' });

      const result = await service.acceptOffer('post-1', TRANSPORTER_ID);

      expect(prisma.postulation.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: {
          status: PostulationStatus.ACCEPTED,
          proposedPrice: 110000, // the shipper's counterOfferPrice
          counterOfferPrice: null,
          lastOfferBy: null,
        },
      });
      expect(prisma.postulation.updateMany).toHaveBeenCalled();
      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 'load-1' },
        data: { status: LoadStatus.ASSIGNED },
      });
      expect(prisma.trip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            loadId: 'load-1',
            carrierId: TRANSPORTER_ID,
            status: TripStatus.ACCEPTED,
          },
        }),
      );
      expect(result).toEqual({
        postulation: { id: 'post-1', status: 'ACCEPTED' },
        trip: { id: 'trip-1' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // withdraw
  // ---------------------------------------------------------------------------
  describe('withdraw', () => {
    it('throws NotFoundException when the postulation does not exist', async () => {
      prisma.postulation.findUnique.mockResolvedValue(null);
      await expect(service.withdraw('post-1', TRANSPORTER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when not the owning transporter', async () => {
      prisma.postulation.findUnique.mockResolvedValue(basePostulation);
      await expect(service.withdraw('post-1', OTHER_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when status is not PENDING/NEGOTIATING', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.ACCEPTED,
      });
      await expect(service.withdraw('post-1', TRANSPORTER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the load is no longer PUBLISHED', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        load: { ...baseLoad, status: LoadStatus.ASSIGNED },
      });
      await expect(service.withdraw('post-1', TRANSPORTER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('withdraws a PENDING postulation', async () => {
      prisma.postulation.findUnique.mockResolvedValue(basePostulation);
      prisma.postulation.update.mockResolvedValue({ id: 'post-1', status: 'WITHDRAWN' });

      const result = await service.withdraw('post-1', TRANSPORTER_ID);

      expect(prisma.postulation.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { status: PostulationStatus.WITHDRAWN },
      });
      expect(result).toEqual({ id: 'post-1', status: 'WITHDRAWN' });
    });

    it('withdraws a NEGOTIATING postulation', async () => {
      prisma.postulation.findUnique.mockResolvedValue({
        ...basePostulation,
        status: PostulationStatus.NEGOTIATING,
        lastOfferBy: 'SHIPPER',
        counterOfferPrice: 95000,
      });
      prisma.postulation.update.mockResolvedValue({ id: 'post-1' });

      await service.withdraw('post-1', TRANSPORTER_ID);
      expect(prisma.postulation.update).toHaveBeenCalled();
    });
  });
});
