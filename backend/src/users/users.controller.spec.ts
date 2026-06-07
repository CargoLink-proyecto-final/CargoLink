import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findById: jest.Mock;
    update: jest.Mock;
    findAll: jest.Mock;
    toggleActive: jest.Mock;
  };

  const baseUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
  };

  beforeEach(async () => {
    usersService = {
      findById: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      toggleActive: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('returns the current user profile', async () => {
      usersService.findById.mockResolvedValue(baseUser);
      const result = await controller.getProfile('user-1');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(result).toBe(baseUser);
    });

    it('propagates NotFoundException from the service', async () => {
      usersService.findById.mockRejectedValue(new NotFoundException());
      await expect(controller.getProfile('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates the current user with the given data', async () => {
      const data = { firstName: 'New', phone: '+999' };
      usersService.update.mockResolvedValue({ ...baseUser, ...data });

      const result = await controller.updateProfile('user-1', data);

      expect(usersService.update).toHaveBeenCalledWith('user-1', data);
      expect(result.firstName).toBe('New');
    });
  });

  describe('findAll', () => {
    it('forwards role/page/limit query params to the service', async () => {
      const page = { users: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      usersService.findAll.mockResolvedValue(page);

      const result = await controller.findAll('ADMIN', 2, 10);

      expect(usersService.findAll).toHaveBeenCalledWith({
        role: 'ADMIN',
        page: 2,
        limit: 10,
      });
      expect(result).toBe(page);
    });

    it('passes undefined params through when no query is given', async () => {
      usersService.findAll.mockResolvedValue({ users: [] });
      await controller.findAll();
      expect(usersService.findAll).toHaveBeenCalledWith({
        role: undefined,
        page: undefined,
        limit: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('returns the user by id', async () => {
      usersService.findById.mockResolvedValue(baseUser);
      const result = await controller.findOne('user-1');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(result).toBe(baseUser);
    });

    it('propagates NotFoundException for a missing user', async () => {
      usersService.findById.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('toggleActive', () => {
    it('toggles the active status of the user', async () => {
      usersService.toggleActive.mockResolvedValue({
        ...baseUser,
        isActive: false,
      });

      const result = await controller.toggleActive('user-1');

      expect(usersService.toggleActive).toHaveBeenCalledWith('user-1');
      expect(result.isActive).toBe(false);
    });

    it('propagates NotFoundException from the service', async () => {
      usersService.toggleActive.mockRejectedValue(new NotFoundException());
      await expect(controller.toggleActive('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
