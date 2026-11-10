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
import { DUMMY_PASSWORD_HASH, hashToken } from './token-crypto';
import { RefreshTokenService } from './refresh-token.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; create: jest.Mock; findById: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let prisma: {
    user: { update: jest.Mock; findFirst: jest.Mock };
    company: { create: jest.Mock };
  };
  let refreshTokens: {
    issue: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
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
    refreshTokens = {
      issue: jest.fn().mockResolvedValue('refresh-token'),
      rotate: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
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
        { provide: RefreshTokenService, useValue: refreshTokens },
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
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
      expect(result.email).toBe(dto.email);
    });

    it('refuses to self-register an ADMIN even if the DTO validation is bypassed', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.register({ ...dto, role: Role.ADMIN })).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
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

    it('returns an access token and a refresh token for valid verified credentials', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      const result = await service.login(dto);
      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(refreshTokens.issue).toHaveBeenCalledWith(baseUser.id);
      expect(result.user.id).toBe(baseUser.id);
      // Nunca se devuelven el hash ni los tokens internos del usuario.
      expect(result.user).not.toHaveProperty('password');
    });

    it('does not open a session when the credentials are wrong', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokens.issue).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    // Sin este compare contra un hash dummy, el login de un email inexistente
    // respondía mucho más rápido y delataba qué cuentas existen.
    // Una cuenta de antes del cambio de costo (10 → 12) se re-hashea al entrar,
    // para que todas terminen con el mismo costo que el hash dummy.
    it('upgrades a legacy-cost password hash after a successful login', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.getRounds as jest.Mock).mockReturnValue(10);

      await service.login(dto);

      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { password: 'hashed-password' },
      });
    });

    it('does not rehash a password that already has the current cost', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.getRounds as jest.Mock).mockReturnValue(12);

      await service.login(dto);

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('does not rehash when the password is wrong', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.getRounds as jest.Mock).mockReturnValue(10);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('still logs in if upgrading the hash fails', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      (bcrypt.getRounds as jest.Mock).mockReturnValue(10);
      prisma.user.update.mockRejectedValueOnce(new Error('db down'));

      await expect(service.login(dto)).resolves.toHaveProperty('accessToken');
    });

    it('still runs bcrypt when the user does not exist, to keep timing uniform', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(bcrypt.compare).toHaveBeenCalledWith(dto.password, DUMMY_PASSWORD_HASH);
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
      expect(result.refreshToken).toBe('refresh-token');
    });

    it('throws BadRequestException for an invalid or expired token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
    });

    it('looks the token up by its hash, never in plain text', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      await service.verifyEmail('valid-token');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ emailVerificationToken: hashToken('valid-token') }),
      });
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

    it('stores only the hash of the reset token and emails the plain one', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      await service.forgotPassword(baseUser.email);

      const plain = mailService.sendPasswordResetEmail.mock.calls[0][2];
      const stored = prisma.user.update.mock.calls[0][0].data.resetToken;
      expect(stored).toBe(hashToken(plain));
      expect(stored).not.toBe(plain);
    });

    it('does not send a reset link to a deactivated or deleted account', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser, isActive: false });
      await service.forgotPassword(baseUser.email);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    // La respuesta no espera al SMTP: si lo hiciera, tardaría segundos solo
    // cuando la cuenta existe y eso permitiría enumerar emails.
    it('responds without waiting for the email to be sent', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      mailService.sendPasswordResetEmail.mockReturnValue(new Promise(() => undefined));
      await expect(service.forgotPassword(baseUser.email)).resolves.toHaveProperty('message');
    });

    it('does not fail when the email cannot be sent', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);
      mailService.sendPasswordResetEmail.mockRejectedValue(new Error('smtp down'));
      await expect(service.forgotPassword(baseUser.email)).resolves.toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    it('looks the reset token up by its hash', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      await service.resetPassword('valid-token', 'newpass123');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ resetToken: hashToken('valid-token') }),
      });
    });

    // Quien conocía la clave vieja no puede seguir adentro después del reset.
    it('closes every open session of the user', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      await service.resetPassword('valid-token', 'newpass123');
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(baseUser.id);
    });

    it('does not touch sessions when the reset token is invalid', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('bad', 'newpass123')).rejects.toThrow(
        BadRequestException,
      );
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('resets the password for a valid token', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      const result = await service.resetPassword('valid-token', 'newpass123');
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 12);
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
  describe('refresh', () => {
    it('returns a new access token for the user of the rotated refresh token', async () => {
      refreshTokens.rotate.mockResolvedValue({
        refreshToken: 'next-refresh',
        user: { id: 'user-1', email: 'a@b.com', firstName: 'A', lastName: 'B', role: Role.ADMIN },
      });

      const result = await service.refresh('old-refresh');

      expect(refreshTokens.rotate).toHaveBeenCalledWith('old-refresh');
      // El rol sale de la base al momento del refresh, no del token anterior.
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1', email: 'a@b.com', role: Role.ADMIN });
      expect(result).toEqual({
        user: expect.objectContaining({ id: 'user-1', role: Role.ADMIN }),
        accessToken: 'signed-token',
        refreshToken: 'next-refresh',
      });
    });

    it('propagates the rejection of an invalid refresh token', async () => {
      refreshTokens.rotate.mockRejectedValue(new UnauthorizedException());
      await expect(service.refresh('bad')).rejects.toThrow(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session of the refresh token', async () => {
      await expect(service.logout('rt')).resolves.toHaveProperty('message');
      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt');
    });
  });
});
