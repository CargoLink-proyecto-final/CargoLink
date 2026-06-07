import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles, ROLES_KEY } from './roles.decorator';

describe('Roles decorator', () => {
  it('exposes the metadata key "roles"', () => {
    expect(ROLES_KEY).toBe('roles');
  });

  it('attaches the provided roles as metadata on the handler', () => {
    class TestController {
      @Roles('ADMIN', 'TRANSPORTER')
      handler() {
        return undefined;
      }
    }

    const reflector = new Reflector();
    const roles = reflector.get(ROLES_KEY, TestController.prototype.handler);
    expect(roles).toEqual(['ADMIN', 'TRANSPORTER']);
  });

  it('attaches an empty array when called with no roles', () => {
    class TestController {
      @Roles()
      handler() {
        return undefined;
      }
    }

    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, TestController.prototype.handler)).toEqual([]);
  });

  it('can be applied at the class level', () => {
    @Controller()
    @Roles('ADMIN')
    class TestController {
      @Get()
      handler() {
        return undefined;
      }
    }

    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, TestController)).toEqual(['ADMIN']);
  });
});
