import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PushService } from '../push/push.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findById: jest.Mock;
    update: jest.Mock;
    findAll: jest.Mock;
    deactivate: jest.Mock;
    reactivate: jest.Mock;
    changeUserEmail: jest.Mock;
    changeRole: jest.Mock;
    getRoleHistory: jest.Mock;
  };
  let pushService: { registerToken: jest.Mock; clearToken: jest.Mock };

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
      deactivate: jest.fn(),
      reactivate: jest.fn(),
      changeUserEmail: jest.fn(),
      changeRole: jest.fn(),
      getRoleHistory: jest.fn(),
    };
    pushService = {
      registerToken: jest.fn().mockResolvedValue(undefined),
      clearToken: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: PushService, useValue: pushService },
      ],
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
    const self = { id: 'user-1', role: 'CARGO_GENERATOR' };
    const admin = { id: 'admin-1', role: 'ADMIN' };

    it('returns your own user', async () => {
      usersService.findById.mockResolvedValue(baseUser);
      const result = await controller.findOne('user-1', self);
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(result).toBe(baseUser);
    });

    it('lets an admin read any user', async () => {
      usersService.findById.mockResolvedValue(baseUser);
      const result = await controller.findOne('user-1', admin);
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(result).toBe(baseUser);
    });

    it('rejects reading another user profile', () => {
      // Antes cualquier autenticado leía la ficha de cualquier otro con su id.
      // El guard corta antes de tocar el service, así que tira sincrónicamente.
      expect(() => controller.findOne('someone-else', self)).toThrow(
        ForbiddenException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException for a missing user', async () => {
      usersService.findById.mockRejectedValue(new NotFoundException());
      await expect(
        controller.findOne('admin-1', admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('push token', () => {
    it('registers a well-formed Expo token', async () => {
      const result = await controller.registerPushToken('user-1', {
        token: 'ExponentPushToken[abc]',
      });

      expect(pushService.registerToken).toHaveBeenCalledWith(
        'user-1',
        'ExponentPushToken[abc]',
      );
      expect(result).toEqual({ registered: true });
    });

    it('rejects anything that is not an Expo token', async () => {
      // Guardar basura haría que cada mensaje intente un envío condenado.
      await expect(
        controller.registerPushToken('user-1', { token: 'not-a-token' }),
      ).rejects.toThrow(BadRequestException);
      expect(pushService.registerToken).not.toHaveBeenCalled();
    });

    it('clears the token on request', async () => {
      const result = await controller.clearPushToken('user-1');

      expect(pushService.clearToken).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ registered: false });
    });
  });

  describe('changeEmail (admin)', () => {
    it('forwards id and new email to the service', async () => {
      usersService.changeUserEmail.mockResolvedValue({ ...baseUser, email: 'new@x.com' });
      const result = await controller.changeEmail('user-1', { email: 'new@x.com' });
      expect(usersService.changeUserEmail).toHaveBeenCalledWith('user-1', 'new@x.com');
      expect(result.email).toBe('new@x.com');
    });
  });

  describe('deactivate (admin)', () => {
    it('deactivates the target user', async () => {
      usersService.deactivate.mockResolvedValue({ ...baseUser, isActive: false });
      const result = await controller.deactivate('user-1');
      expect(usersService.deactivate).toHaveBeenCalledWith('user-1');
      expect(result.isActive).toBe(false);
    });

    it('propagates NotFoundException from the service', async () => {
      usersService.deactivate.mockRejectedValue(new NotFoundException());
      await expect(controller.deactivate('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivate (admin)', () => {
    it('reactivates the target user', async () => {
      usersService.reactivate.mockResolvedValue({ ...baseUser, isActive: true });
      const result = await controller.reactivate('user-1');
      expect(usersService.reactivate).toHaveBeenCalledWith('user-1');
      expect(result.isActive).toBe(true);
    });
  });

  describe('changeRole (admin)', () => {
    it('forwards target id, new role and admin id to the service', async () => {
      usersService.changeRole.mockResolvedValue({ ...baseUser, role: Role.TRANSPORTER });
      const result = await controller.changeRole('user-1', { role: Role.TRANSPORTER }, 'admin-1');
      expect(usersService.changeRole).toHaveBeenCalledWith('user-1', Role.TRANSPORTER, 'admin-1');
      expect(result.role).toBe(Role.TRANSPORTER);
    });
  });

  describe('roleHistory (admin)', () => {
    it('returns the role change history', async () => {
      usersService.getRoleHistory.mockResolvedValue([{ id: 'log-1' }]);
      const result = await controller.roleHistory('user-1');
      expect(usersService.getRoleHistory).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'log-1' }]);
    });
  });
});
