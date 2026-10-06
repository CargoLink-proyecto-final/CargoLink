import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; create: jest.Mock; findById: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let prisma: {
    user: { update: jest.Mock; findFirst: jest.Mock };
    company: { create: jest.Mock };
  };
  let mailService: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };

  const baseUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: Role.CARGO_GENERATOR,
    password: 'hashed',
    emailVerified: true,
    isActive: true,
  };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn(), create: jest.fn(), findById: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
    prisma = {
      user: { update: jest.fn().mockResolvedValue(baseUser), findFirst: jest.fn() },
      company: { create: jest.fn().mockResolvedValue({ id: 'company-1' }) },
    };
    mailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const dto = {
      email: 'new@example.com',
      password: 'secret123',
      firstName: 'New',
      lastName: 'User',
      role: Role.CARGO_GENERATOR,
    } as any;

    it('creates a user and sends a verification email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...baseUser, email: dto.email });

      const result = await service.register(dto);

      expect(usersService.create).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10);
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
      expect(result.email).toBe(dto.email);
    });

    it('throws ConflictException when email is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('requires a company name for COMPANY_ADMIN role', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.register({ ...dto, role: Role.COMPANY_ADMIN, companyName: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a Company for COMPANY_ADMIN registration', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...baseUser, role: Role.COMPANY_ADMIN });

      await service.register({ ...dto, role: Role.COMPANY_ADMIN, companyName: 'Acme' });

      expect(prisma.company.create).toHaveBeenCalledWith({
        data: { name: 'Acme', ownerId: baseUser.id },
      });
    });

    it('still succeeds if the verification email fails to send', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...baseUser, email: dto.email });
      mailService.sendVerificationEmail.mockRejectedValue(new Error('smtp down'));

      const result = await service.register(dto);
      expect(result.email).toBe(dto.email);
    });
  });

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'secret123' } as any;

    it('returns a token for valid verified credentials', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      const result = await service.login(dto);
      expect(result.accessToken).toBe('signed-token');
      expect(result.user.id).toBe(baseUser.id);
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when the email is not verified', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser, emailVerified: false });
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the account is deactivated', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser, isActive: false });
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyEmail', () => {
    it('verifies the email and returns a token for a valid token', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      const result = await service.verifyEmail('valid-token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationTokenExp: null,
        },
      });
      expect(result.accessToken).toBe('signed-token');
    });

    it('throws BadRequestException for an invalid or expired token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendVerification', () => {
    it('returns an opaque response when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const result = await service.resendVerification('nobody@example.com');
      expect(result.message).toBeDefined();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('does nothing when the user is already verified', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser, emailVerified: true });
      await service.resendVerification(baseUser.email);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    // Una cuenta eliminada queda con emailVerified en false, así que sin el corte
    // por isActive se generaba un token y se mandaba un mail a la dirección
    // placeholder @cargolink.invalid: un bounce garantizado contra el SMTP real.
    it('does nothing for a deleted or deactivated account', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        emailVerified: false,
        isActive: false,
      });

      await service.resendVerification(baseUser.email);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends a new verification email for an unverified user', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser, emailVerified: false });
      await service.resendVerification(baseUser.email);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('returns a generic message when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const result = await service.forgotPassword('nobody@example.com');
      expect(result.message).toBeDefined();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores a reset token and emails the user when found', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      await service.forgotPassword(baseUser.email);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('resets the password for a valid token', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      const result = await service.resetPassword('valid-token', 'newpass123');
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(result.message).toBeDefined();
    });

    it('throws BadRequestException for an invalid or expired token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('bad', 'newpass123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
