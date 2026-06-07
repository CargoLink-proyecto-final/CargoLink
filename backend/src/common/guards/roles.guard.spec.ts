import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const handler = () => undefined;
  class FakeController {}

  const buildContext = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => FakeController,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows access when no roles metadata is set', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({ role: 'TRANSPORTER' });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      handler,
      FakeController,
    ]);
  });

  it('allows access when the user role is in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'TRANSPORTER']);
    const ctx = buildContext({ role: 'TRANSPORTER' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when the user role is not in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const ctx = buildContext({ role: 'TRANSPORTER' });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('denies access when the required roles list is empty', () => {
    // Empty array is truthy, so the guard checks membership and finds none.
    reflector.getAllAndOverride.mockReturnValue([]);
    const ctx = buildContext({ role: 'ADMIN' });

    expect(guard.canActivate(ctx)).toBe(false);
  });
});
