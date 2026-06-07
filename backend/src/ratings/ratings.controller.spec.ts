import { Test, TestingModule } from '@nestjs/testing';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';

describe('RatingsController', () => {
  let controller: RatingsController;
  let service: { create: jest.Mock; getUserRatings: jest.Mock };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      getUserRatings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RatingsController],
      providers: [{ provide: RatingsService, useValue: service }],
    }).compile();

    controller = module.get<RatingsController>(RatingsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to RatingsService.create with the current user id and dto', async () => {
      const dto: CreateRatingDto = {
        tripId: 'trip-1',
        score: 5,
        comment: 'Nice',
      };
      const created = { id: 'rating-1' };
      service.create.mockResolvedValue(created);

      const result = await controller.create('user-1', dto);

      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toBe(created);
    });

    it('propagates errors thrown by the service', async () => {
      const dto: CreateRatingDto = { tripId: 'trip-1', score: 5 };
      service.create.mockRejectedValue(new Error('boom'));

      await expect(controller.create('user-1', dto)).rejects.toThrow('boom');
    });
  });

  describe('getUserRatings', () => {
    it('delegates to RatingsService.getUserRatings with the param userId', async () => {
      const payload = { ratings: [], averageScore: 0, totalRatings: 0 };
      service.getUserRatings.mockResolvedValue(payload);

      const result = await controller.getUserRatings('user-2');

      expect(service.getUserRatings).toHaveBeenCalledWith('user-2');
      expect(result).toBe(payload);
    });
  });
});
