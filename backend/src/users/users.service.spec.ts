import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PUBLIC_USER_SELECT, UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('UsersService', () => {
  let service: UsersService;
  let mailService: { sendVerificationEmail: jest.Mock };
  let prisma: {
    user: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    load: { count: jest.Mock };
    trip: { count: jest.Mock };
    roleChangeLog: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
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
      load: { count: jest.fn() },
      trip: { count: jest.fn() },
      roleChangeLog: { create: jest.fn(), findMany: jest.fn() },
      // El service usa $transaction([...]) y espera el array de resultados resuelto.
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    mailService = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
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
    it('returns the user when found, asking Prisma for the safe fields only', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.findById('user-1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: PUBLIC_USER_SELECT,
      });
      expect(result).toBe(baseUser);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // El bug era devolver el registro crudo de Prisma: el hash de la contraseña y
  // los tokens de verificación/reset viajaban en cada respuesta que incluía un
  // usuario. La allowlist es el arreglo; estos tests la fijan.
  describe('PUBLIC_USER_SELECT', () => {
    it('never exposes the password hash or the account tokens', () => {
      const exposed = Object.keys(PUBLIC_USER_SELECT);
      for (const secret of [
        'password',
        'resetToken',
        'resetTokenExp',
        'emailVerificationToken',
        'emailVerificationTokenExp',
      ]) {
        expect(exposed).not.toContain(secret);
      }
    });

    it('is an allowlist, so a new column is not exposed by default', () => {
      // Si esto se rompe es porque alguien usó `false` para excluir un campo:
      // eso vuelve el select una denylist y reintroduce el bug.
      expect(Object.values(PUBLIC_USER_SELECT).every((v) => v === true)).toBe(true);
    });

    it('still carries what the JWT strategy needs to authorize a request', () => {
      // jwt.strategy resuelve el usuario en cada request con findById.
      expect(PUBLIC_USER_SELECT).toMatchObject({
        id: true,
        email: true,
        role: true,
        isActive: true,
      });
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
        select: PUBLIC_USER_SELECT,
      });
      expect(result.firstName).toBe('Updated');
    });
  });

  describe('hasActiveOperations', () => {
    it('returns true when there are active loads', async () => {
      prisma.load.count.mockResolvedValue(2);
      prisma.trip.count.mockResolvedValue(0);
      expect(await service.hasActiveOperations('user-1')).toBe(true);
    });

    it('returns true when there are active trips', async () => {
      prisma.load.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(1);
      expect(await service.hasActiveOperations('user-1')).toBe(true);
    });

    it('returns false when there are no active operations', async () => {
      prisma.load.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(0);
      expect(await service.hasActiveOperations('user-1')).toBe(false);
    });
  });

  describe('deactivate', () => {
    it('sets isActive=false when there are no active operations', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: true });
      prisma.load.count.mockResolvedValue(0);
      prisma.trip.count.mockResolvedValue(0);
      prisma.user.update.mockResolvedValue({ ...baseUser, isActive: false });

      const result = await service.deactivate('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false },
        select: PUBLIC_USER_SELECT,
      });
      expect(result.isActive).toBe(false);
    });

    it('throws ConflictException when the user has active operations', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: true });
      prisma.load.count.mockResolvedValue(1);
      prisma.trip.count.mockResolvedValue(0);

      await expect(service.deactivate('user-1')).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the user is already inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
      const result = await service.deactivate('user-1');
      expect(result.isActive).toBe(false);
      expect(prisma.load.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.deactivate('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivate', () => {
    it('sets isActive=true', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
      prisma.user.update.mockResolvedValue({ ...baseUser, isActive: true });

      const result = await service.reactivate('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: true },
        select: PUBLIC_USER_SELECT,
      });
      expect(result.isActive).toBe(true);
    });
  });

  describe('changeUserEmail', () => {
    it('updates the email, unverifies the account and sends a verification email', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(baseUser) // findById
        .mockResolvedValueOnce(null); // findByEmail (not taken)
      prisma.user.update.mockResolvedValue({ ...baseUser, email: 'new@example.com', emailVerified: false });

      const result = await service.changeUserEmail('user-1', 'New@Example.com');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ email: 'new@example.com', emailVerified: false }),
          // Esta ruta escribe un token de verificación nuevo: sin el select, la
          // respuesta se lo devolvería al admin junto con el hash.
          select: PUBLIC_USER_SELECT,
        }),
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
      expect(result.email).toBe('new@example.com');
    });

    it('throws BadRequestException when the new email equals the current one', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(baseUser);
      await expect(service.changeUserEmail('user-1', baseUser.email)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the new email is already taken', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(baseUser) // findById
        .mockResolvedValueOnce({ ...baseUser, id: 'other' }); // findByEmail
      await expect(service.changeUserEmail('user-1', 'taken@example.com')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('changeRole', () => {
    it('updates the role and writes an audit log in a transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: Role.CARGO_GENERATOR });
      prisma.user.update.mockResolvedValue({ ...baseUser, role: Role.TRANSPORTER });
      prisma.roleChangeLog.create.mockResolvedValue({ id: 'log-1' });

      const result = await service.changeRole('user-1', Role.TRANSPORTER, 'admin-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.roleChangeLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          changedById: 'admin-1',
          oldRole: Role.CARGO_GENERATOR,
          newRole: Role.TRANSPORTER,
        },
      });
      expect(result.role).toBe(Role.TRANSPORTER);
    });

    it('clears companyId when demoting away from TRANSPORTER', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: Role.TRANSPORTER });
      prisma.user.update.mockResolvedValue({ ...baseUser, role: Role.CARGO_GENERATOR });
      prisma.roleChangeLog.create.mockResolvedValue({ id: 'log-1' });

      await service.changeRole('user-1', Role.CARGO_GENERATOR, 'admin-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: Role.CARGO_GENERATOR, companyId: null },
        select: PUBLIC_USER_SELECT,
      });
    });

    it('rejects an admin changing their own role', async () => {
      await expect(
        service.changeRole('admin-1', Role.TRANSPORTER, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects transitions to/from COMPANY_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: Role.CARGO_GENERATOR });
      await expect(
        service.changeRole('user-1', Role.COMPANY_ADMIN, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when the user already has the target role', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: Role.TRANSPORTER });
      await expect(
        service.changeRole('user-1', Role.TRANSPORTER, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRoleHistory', () => {
    it('returns the change log for a user with the author included', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.roleChangeLog.findMany.mockResolvedValue([{ id: 'log-1' }]);

      const result = await service.getRoleHistory('user-1');

      expect(prisma.roleChangeLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'log-1' }]);
    });
  });
});
