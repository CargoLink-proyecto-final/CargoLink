import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { ProfileCompleteGuard } from './profile-complete.guard';
import { REQUIRED_DOCUMENT_TYPES } from '../../transporter-profile/profile-completeness';

describe('ProfileCompleteGuard', () => {
  let guard: ProfileCompleteGuard;
  let prisma: {
    user: { findUnique: jest.Mock };
    vehicle: { findUnique: jest.Mock };
    document: { findMany: jest.Mock };
  };

  const completeUser = {
    cuit: '20-12345678-3',
    licenseCategory: 'E1',
    licenseExpiresAt: new Date('2027-01-01'),
    termsAcceptedAt: new Date('2026-01-01'),
  };

  const buildContext = (userId: string): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      vehicle: { findUnique: jest.fn() },
      document: { findMany: jest.fn() },
    };
    guard = new ProfileCompleteGuard(prisma as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('allows access when the profile is complete', async () => {
    prisma.user.findUnique.mockResolvedValue(completeUser);
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.document.findMany.mockResolvedValue(
      REQUIRED_DOCUMENT_TYPES.map((type) => ({ type })),
    );

    await expect(guard.canActivate(buildContext('user-1'))).resolves.toBe(true);
  });

  it('throws ForbiddenException with the missing pieces when the profile is incomplete', async () => {
    prisma.user.findUnique.mockResolvedValue(completeUser);
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.document.findMany.mockResolvedValue([{ type: DocumentType.DNI_FRONT }]);

    await expect(guard.canActivate(buildContext('user-1'))).rejects.toThrow(ForbiddenException);
    try {
      await guard.canActivate(buildContext('user-1'));
    } catch (err) {
      const response = (err as ForbiddenException).getResponse() as { missing: string[] };
      expect(response.missing).toContain('vehicle');
      expect(response.missing).toContain('document:DNI_BACK');
    }
  });

  it('treats a not-yet-persisted user as fully missing instead of throwing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.document.findMany.mockResolvedValue([]);

    await expect(guard.canActivate(buildContext('user-1'))).rejects.toThrow(ForbiddenException);
  });
});
