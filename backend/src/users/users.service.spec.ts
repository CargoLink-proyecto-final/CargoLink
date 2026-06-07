import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };

  const baseUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    phone: '+123',
    role: Role.CARGO_GENERATOR,
    companyName: null,
    isActive: true,
    password: 'hashed',
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a user passing through provided firstName/lastName', async () => {
      const data = {
        email: 'new@example.com',
        password: 'hashed',
        firstName: 'New',
        lastName: 'User',
        phone: '+1',
        role: Role.CARGO_GENERATOR,
      } as any;
      prisma.user.create.mockResolvedValue({ ...baseUser, ...data });

      const result = await service.create(data);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { ...data, firstName: 'New', lastName: 'User' },
      });
      expect(result.email).toBe('new@example.com');
    });

    it('defaults firstName/lastName to empty string when missing (company accounts)', async () => {
      const data = {
        email: 'acme@example.com',
        password: 'hashed',
        phone: '+1',
        role: Role.COMPANY_ADMIN,
        companyName: 'Acme',
      } as any;
      prisma.user.create.mockResolvedValue({ ...baseUser, ...data });

      await service.create(data);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { ...data, firstName: '', lastName: '' },
      });
    });
  });

  describe('findByEmail', () => {
    it('returns the user found by email', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.findByEmail(baseUser.email);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: baseUser.email },
      });
      expect(result).toBe(baseUser);
    });

    it('returns null when no user matches the email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.findByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.findById('user-1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(result).toBe(baseUser);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('uses default pagination and no role filter when no params are given', async () => {
      prisma.user.findMany.mockResolvedValue([baseUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({ where: {} });
      expect(result).toEqual({
        users: [baseUser],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('applies role filter and custom pagination', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(45);

      const result = await service.findAll({
        role: 'TRANSPORTER',
        page: 3,
        limit: 10,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'TRANSPORTER' },
          skip: 20,
          take: 10,
        }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: 'TRANSPORTER' },
      });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(45);
      expect(result.totalPages).toBe(5);
    });

    it('computes totalPages as 0 when there are no users', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.findAll();
      expect(result.totalPages).toBe(0);
    });

    it('falls back to defaults when page/limit are provided as 0 (falsy)', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ page: 0, limit: 0 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('selects only public fields and orders by createdAt desc', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll();

      const arg = prisma.user.findMany.mock.calls[0][0];
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
      expect(arg.select).toMatchObject({
        id: true,
        email: true,
        role: true,
        isActive: true,
      });
      expect(arg.select.password).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates the user with the given data', async () => {
      const data = { firstName: 'Updated', phone: '+999' };
      prisma.user.update.mockResolvedValue({ ...baseUser, ...data });

      const result = await service.update('user-1', data);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data,
      });
      expect(result.firstName).toBe('Updated');
    });
  });

  describe('toggleActive', () => {
    it('flips isActive from true to false', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: true });
      prisma.user.update.mockResolvedValue({ ...baseUser, isActive: false });

      const result = await service.toggleActive('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('flips isActive from false to true', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
      prisma.user.update.mockResolvedValue({ ...baseUser, isActive: true });

      const result = await service.toggleActive('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: true },
      });
      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.toggleActive('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
