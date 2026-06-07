import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('is defined', () => {
    expect(new JwtAuthGuard()).toBeDefined();
  });

  it('is an instance of the passport jwt AuthGuard', () => {
    const guard = new JwtAuthGuard();
    // AuthGuard('jwt') returns a mixin class; the instance must inherit from it.
    expect(guard).toBeInstanceOf(AuthGuard('jwt'));
  });

  it('exposes a canActivate method inherited from AuthGuard', () => {
    const guard = new JwtAuthGuard();
    expect(typeof guard.canActivate).toBe('function');
  });
});
