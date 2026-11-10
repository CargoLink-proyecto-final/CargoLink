import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsersService } from '../users/users.service';

describe('JwtStrategy', () => {
  const buildConfig = (secret?: string): ConfigService =>
    ({
      get: jest.fn((_key: string, def?: string) => secret ?? def),
    }) as unknown as ConfigService;

  const buildUsers = (findById: jest.Mock): UsersService =>
    ({ findById }) as unknown as UsersService;

  const payload: JwtPayload = {
    sub: 'user-1',
    email: 'test@example.com',
    role: 'TRANSPORTER',
  };

  it('is defined', () => {
    const strategy = new JwtStrategy(buildConfig('my-secret'), buildUsers(jest.fn()));
    expect(strategy).toBeDefined();
  });

  it('reads JWT_SECRET from config', () => {
    const config = buildConfig('my-secret');
    new JwtStrategy(config, buildUsers(jest.fn()));
    expect(config.get).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('refuses to start without JWT_SECRET instead of using a public default', () => {
    expect(() => new JwtStrategy(buildConfig(undefined), buildUsers(jest.fn()))).toThrow(
      /JWT_SECRET/,
    );
  });

  describe('validate', () => {
    it('resolves the user from DB and returns the current role', async () => {
      const findById = jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN', // distinto del payload: debe ganar el de la DB
        isActive: true,
      });
      const strategy = new JwtStrategy(buildConfig('s'), buildUsers(findById));

      await expect(strategy.validate(payload)).resolves.toEqual({
        id: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
      });
      expect(findById).toHaveBeenCalledWith('user-1');
    });

    it('rejects when the user is deactivated', async () => {
      const findById = jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'TRANSPORTER',
        isActive: false,
      });
      const strategy = new JwtStrategy(buildConfig('s'), buildUsers(findById));
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the user no longer exists', async () => {
      const findById = jest.fn().mockRejectedValue(new Error('not found'));
      const strategy = new JwtStrategy(buildConfig('s'), buildUsers(findById));
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });
  });
});
