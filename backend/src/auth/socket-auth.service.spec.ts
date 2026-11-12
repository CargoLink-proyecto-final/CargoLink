import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';
import { SocketAuthService, extractSocketToken } from './socket-auth.service';
import { UsersService } from '../users/users.service';

describe('SocketAuthService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const sign = (sub: string, opts: { expiresIn?: string | number; secret?: string } = {}) =>
    jwt.sign({ sub, email: 'x@x.com', role: 'TRANSPORTER' }, { expiresIn: '5m', ...opts });

  const build = (findById: jest.Mock) =>
    new SocketAuthService(jwt, { findById } as unknown as UsersService);

  it('returns the user resolved from the DB for a valid token', async () => {
    const findById = jest.fn().mockResolvedValue({ id: 'u1', role: 'ADMIN', isActive: true });
    await expect(build(findById).authenticate(sign('u1'))).resolves.toEqual({
      id: 'u1',
      role: 'ADMIN',
    });
  });

  it('rejects a token signed with another secret', async () => {
    const findById = jest.fn();
    await expect(
      build(findById).authenticate(sign('u1', { secret: 'attacker' })),
    ).resolves.toBeNull();
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const findById = jest.fn();
    await expect(build(findById).authenticate(sign('u1', { expiresIn: -10 }))).resolves.toBeNull();
  });

  it('rejects deactivated or missing users', async () => {
    const inactive = jest.fn().mockResolvedValue({ id: 'u1', role: 'ADMIN', isActive: false });
    await expect(build(inactive).authenticate(sign('u1'))).resolves.toBeNull();

    const missing = jest.fn().mockRejectedValue(new NotFoundException());
    await expect(build(missing).authenticate(sign('u1'))).resolves.toBeNull();
  });

  it('rejects an empty token', async () => {
    await expect(build(jest.fn()).authenticate(undefined)).resolves.toBeNull();
  });
});

describe('extractSocketToken', () => {
  it('prefers handshake.auth.token', () => {
    expect(extractSocketToken({ auth: { token: 'a' }, headers: { authorization: 'Bearer b' } })).toBe(
      'a',
    );
  });

  it('falls back to the Authorization header', () => {
    expect(extractSocketToken({ auth: {}, headers: { authorization: 'Bearer b' } })).toBe('b');
  });

  it('returns null without credentials', () => {
    expect(extractSocketToken({ auth: {}, headers: {} })).toBeNull();
  });
});
