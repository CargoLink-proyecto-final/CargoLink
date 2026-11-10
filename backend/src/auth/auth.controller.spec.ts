import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    verifyEmail: jest.Mock;
    resendVerification: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerification: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }])],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('rate limiting', () => {
    // Los límites viven como metadata de @Throttle: si alguien los borra, el
    // login vuelve a aceptar intentos ilimitados de fuerza bruta.
    const limitOf = (handler: keyof AuthController) =>
      Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype[handler]);

    it.each([
      ['login', 10],
      ['register', 5],
      ['forgotPassword', 5],
      ['resendVerification', 5],
      ['resetPassword', 10],
    ] as const)('limits %s to %i requests per window', (handler, limit) => {
      expect(limitOf(handler)).toBe(limit);
    });
  });

  describe('register', () => {
    it('delegates to authService.register with the dto and returns its result', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'secret123',
        firstName: 'New',
        lastName: 'User',
        role: Role.CARGO_GENERATOR,
      } as any;
      const expected = { id: 'user-1', email: dto.email };
      authService.register.mockResolvedValue(expected);

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(authService.register).toHaveBeenCalledTimes(1);
      expect(result).toBe(expected);
    });
  });

  describe('login', () => {
    it('delegates to authService.login with the dto and returns its result', async () => {
      const dto = { email: 'test@example.com', password: 'secret123' } as any;
      const expected = { accessToken: 'signed-token', user: { id: 'user-1' } };
      authService.login.mockResolvedValue(expected);

      const result = await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toBe(expected);
    });
  });

  describe('verifyEmail', () => {
    it('delegates to authService.verifyEmail with the token param', async () => {
      const expected = { accessToken: 'signed-token' };
      authService.verifyEmail.mockResolvedValue(expected);

      const result = await controller.verifyEmail('valid-token');

      expect(authService.verifyEmail).toHaveBeenCalledWith('valid-token');
      expect(result).toBe(expected);
    });
  });

  describe('resendVerification', () => {
    it('delegates to authService.resendVerification with dto.email', async () => {
      const dto = { email: 'test@example.com' } as any;
      const expected = { message: 'sent' };
      authService.resendVerification.mockResolvedValue(expected);

      const result = await controller.resendVerification(dto);

      expect(authService.resendVerification).toHaveBeenCalledWith(dto.email);
      expect(result).toBe(expected);
    });
  });

  describe('forgotPassword', () => {
    it('delegates to authService.forgotPassword with dto.email', async () => {
      const dto = { email: 'test@example.com' } as any;
      const expected = { message: 'sent' };
      authService.forgotPassword.mockResolvedValue(expected);

      const result = await controller.forgotPassword(dto);

      expect(authService.forgotPassword).toHaveBeenCalledWith(dto.email);
      expect(result).toBe(expected);
    });
  });

  describe('resetPassword', () => {
    it('delegates to authService.resetPassword with token and newPassword', async () => {
      const dto = { token: 'reset-token', newPassword: 'newpass123' } as any;
      const expected = { message: 'reset' };
      authService.resetPassword.mockResolvedValue(expected);

      const result = await controller.resetPassword(dto);

      expect(authService.resetPassword).toHaveBeenCalledWith(dto.token, dto.newPassword);
      expect(result).toBe(expected);
    });
  });
});
