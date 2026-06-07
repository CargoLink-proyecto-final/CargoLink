import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  const buildConfig = (secret?: string): ConfigService =>
    ({
      get: jest.fn((_key: string, def?: string) => secret ?? def),
    }) as unknown as ConfigService;

  it('is defined', () => {
    const strategy = new JwtStrategy(buildConfig('my-secret'));
    expect(strategy).toBeDefined();
  });

  it('reads JWT_SECRET from config with the default fallback', () => {
    const config = buildConfig('my-secret');
    new JwtStrategy(config);
    expect(config.get).toHaveBeenCalledWith('JWT_SECRET', 'default-secret');
  });

  it('can be constructed when JWT_SECRET is missing (uses default)', () => {
    expect(() => new JwtStrategy(buildConfig(undefined))).not.toThrow();
  });

  describe('validate', () => {
    it('maps a JWT payload into the request user shape', () => {
      const strategy = new JwtStrategy(buildConfig('my-secret'));
      const payload: JwtPayload = {
        sub: 'user-1',
        email: 'test@example.com',
        role: 'TRANSPORTER',
      };

      expect(strategy.validate(payload)).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        role: 'TRANSPORTER',
      });
    });
  });
});
