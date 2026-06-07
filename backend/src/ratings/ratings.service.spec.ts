import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { RatingsService } from './ratings.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './dto/create-rating.dto';

describe('RatingsService', () => {
  let service: RatingsService;
  let prisma: {
    trip: { findUnique: jest.Mock };
    rating: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
  };

  const carrierId = 'carrier-1';
  const shipperId = 'shipper-1';

  const completedTrip = {
    id: 'trip-1',
    status: TripStatus.COMPLETED,
    carrierId,
    load: { shipperId },
  };

  const dto: CreateRatingDto = {
    tripId: 'trip-1',
    score: 5,
    comment: 'Great service',
  };

  beforeEach(async () => {
    prisma = {
      trip: { findUnique: jest.fn() },
      rating: {
        create: jest.fn().mockResolvedValue({ id: 'rating-1' }),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a rating when the shipper rates a completed trip (toUser = carrier)', async () => {
      prisma.trip.findUnique.mockResolvedValue(completedTrip);

      const result = await service.create(shipperId, dto);

      expect(prisma.trip.findUnique).toHaveBeenCalledWith({
        where: { id: dto.tripId },
        include: { load: true },
      });
      expect(prisma.rating.create).toHaveBeenCalledWith({
        data: {
          tripId: dto.tripId,
          fromUserId: shipperId,
          toUserId: carrierId,
          score: dto.score,
          comment: dto.comment,
        },
        include: {
          fromUser: { select: { id: true, firstName: true, lastName: true } },
          toUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      expect(result).toEqual({ id: 'rating-1' });
    });

    it('throws ForbiddenException when the carrier (transporter) tries to rate', async () => {
      prisma.trip.findUnique.mockResolvedValue(completedTrip);

      await expect(service.create(carrierId, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.rating.create).not.toHaveBeenCalled();
    });

    it('persists comment as undefined when omitted', async () => {
      prisma.trip.findUnique.mockResolvedValue(completedTrip);

      await service.create(shipperId, { tripId: 'trip-1', score: 4 });

      expect(prisma.rating.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ comment: undefined, score: 4 }),
        }),
      );
    });

    it('throws NotFoundException when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);

      await expect(service.create(carrierId, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.rating.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the trip is not COMPLETED', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        ...completedTrip,
        status: TripStatus.IN_PROGRESS,
      });

      await expect(service.create(carrierId, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.rating.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the user would rate themselves (carrier is also shipper)', async () => {
      // carrierId === fromUserId so toUserId resolves to load.shipperId;
      // make shipperId equal fromUserId to trigger self-rating guard.
      prisma.trip.findUnique.mockResolvedValue({
        ...completedTrip,
        carrierId,
        load: { shipperId: carrierId },
      });

      await expect(service.create(carrierId, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.rating.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when fromUser is neither carrier nor shipper of the trip', async () => {
      prisma.trip.findUnique.mockResolvedValue(completedTrip);

      await expect(service.create('outsider-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.rating.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the shipper already rated this trip', async () => {
      prisma.trip.findUnique.mockResolvedValue(completedTrip);
      prisma.rating.findUnique.mockResolvedValue({ id: 'existing-rating' });

      await expect(service.create(shipperId, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.rating.create).not.toHaveBeenCalled();
    });
  });

  describe('getUserRatings', () => {
    it('returns ratings with averageScore rounded to one decimal and totalRatings', async () => {
      const ratings = [
        { id: 'r1', score: 5 },
        { id: 'r2', score: 4 },
        { id: 'r3', score: 4 },
      ];
      prisma.rating.findMany.mockResolvedValue(ratings);

      const result = await service.getUserRatings(shipperId);

      expect(prisma.rating.findMany).toHaveBeenCalledWith({
        where: { toUserId: shipperId },
        include: {
          fromUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      // (5 + 4 + 4) / 3 = 4.333... -> 4.3
      expect(result.averageScore).toBe(4.3);
      expect(result.totalRatings).toBe(3);
      expect(result.ratings).toBe(ratings);
    });

    it('returns averageScore 0 and totalRatings 0 when there are no ratings', async () => {
      prisma.rating.findMany.mockResolvedValue([]);

      const result = await service.getUserRatings(shipperId);

      expect(result.averageScore).toBe(0);
      expect(result.totalRatings).toBe(0);
      expect(result.ratings).toEqual([]);
    });

    it('rounds a clean average correctly', async () => {
      prisma.rating.findMany.mockResolvedValue([
        { id: 'r1', score: 5 },
        { id: 'r2', score: 3 },
      ]);

      const result = await service.getUserRatings(shipperId);

      // (5 + 3) / 2 = 4 -> 4
      expect(result.averageScore).toBe(4);
    });

    it('rounds .15-style averages to one decimal', async () => {
      prisma.rating.findMany.mockResolvedValue([
        { id: 'r1', score: 5 },
        { id: 'r2', score: 5 },
        { id: 'r3', score: 5 },
        { id: 'r4', score: 1 },
      ]);

      const result = await service.getUserRatings(shipperId);

      // (5+5+5+1)/4 = 4 -> 4
      expect(result.averageScore).toBe(4);
    });

    it('computes a single-rating average equal to that score', async () => {
      prisma.rating.findMany.mockResolvedValue([{ id: 'r1', score: 2 }]);

      const result = await service.getUserRatings(shipperId);

      expect(result.averageScore).toBe(2);
      expect(result.totalRatings).toBe(1);
    });
  });
});
