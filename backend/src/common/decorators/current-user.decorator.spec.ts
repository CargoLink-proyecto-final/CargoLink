import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

/**
 * `CurrentUser` is built with `createParamDecorator`. The factory is not
 * exported directly, so we recover it from the route-args metadata that NestJS
 * stores when the decorator is applied to a parameter, then exercise it with a
 * fake ExecutionContext.
 */
function getFactory(decorator: ReturnType<typeof CurrentUser>) {
  class TestTarget {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handler(@decorator value: unknown) {
      return value;
    }
  }

  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestTarget,
    'handler',
  );
  const key = Object.keys(metadata)[0];
  return metadata[key].factory as (
    data: string | undefined,
    ctx: ExecutionContext,
  ) => unknown;
}

describe('CurrentUser decorator', () => {
  const user = { id: 'user-1', email: 'test@example.com', role: 'ADMIN' };

  const buildContext = (requestUser: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: requestUser }) }),
    }) as unknown as ExecutionContext;

  it('returns the whole user object when no data key is given', () => {
    const factory = getFactory(CurrentUser());
    expect(factory(undefined, buildContext(user))).toEqual(user);
  });

  it('returns a single field when a data key is provided', () => {
    const factory = getFactory(CurrentUser('email'));
    expect(factory('email', buildContext(user))).toBe('test@example.com');
  });

  it('returns undefined for a field when there is no user on the request', () => {
    const factory = getFactory(CurrentUser('email'));
    expect(factory('email', buildContext(undefined))).toBeUndefined();
  });

  it('returns undefined as the whole user when request has no user', () => {
    const factory = getFactory(CurrentUser());
    expect(factory(undefined, buildContext(undefined))).toBeUndefined();
  });
});
