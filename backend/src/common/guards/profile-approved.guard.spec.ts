import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { ProfileApprovedGuard } from './profile-approved.guard';
import { REQUIRED_DOCUMENT_TYPES } from '../../transporter-profile/profile-completeness';

describe('ProfileApprovedGuard', () => {
  let guard: ProfileApprovedGuard;
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

  const allDocuments = (status: DocumentStatus) =>
    REQUIRED_DOCUMENT_TYPES.map((type) => ({ type, status }));

  const buildContext = (userId: string): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }),
    }) as unknown as ExecutionContext;

  const getForbiddenResponse = async () => {
    try {
      await guard.canActivate(buildContext('user-1'));
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      return (err as ForbiddenException).getResponse() as {
        state: string;
        missing: string[];
        pendingReview: DocumentType[];
        rejected: DocumentType[];
      };
    }
    throw new Error('expected the guard to throw');
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      vehicle: { findUnique: jest.fn() },
      document: { findMany: jest.fn() },
    };
    guard = new ProfileApprovedGuard(prisma as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('allows access when every required document is approved', async () => {
    prisma.user.findUnique.mockResolvedValue(completeUser);
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.document.findMany.mockResolvedValue(allDocuments(DocumentStatus.APPROVED));

    await expect(guard.canActivate(buildContext('user-1'))).resolves.toBe(true);
  });

  it('blocks a complete profile that is still pending admin review', async () => {
    prisma.user.findUnique.mockResolvedValue(completeUser);
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.document.findMany.mockResolvedValue(allDocuments(DocumentStatus.PENDING));

    const response = await getForbiddenResponse();
    expect(response.state).toBe('PENDING_REVIEW');
    expect(response.pendingReview).toHaveLength(REQUIRED_DOCUMENT_TYPES.length);
  });

  it('blocks a profile with a rejected document and reports which one', async () => {
    prisma.user.findUnique.mockResolvedValue(completeUser);
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.document.findMany.mockResolvedValue(
      REQUIRED_DOCUMENT_TYPES.map((type) => ({
        type,
        status: type === DocumentType.VTV ? DocumentStatus.REJECTED : DocumentStatus.APPROVED,
      })),
    );

    const response = await getForbiddenResponse();
    expect(response.state).toBe('REJECTED');
    expect(response.rejected).toEqual([DocumentType.VTV]);
  });

  it('reports the missing pieces when the profile is incomplete', async () => {
    prisma.user.findUnique.mockResolvedValue(completeUser);
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.document.findMany.mockResolvedValue([
      { type: DocumentType.DNI_FRONT, status: DocumentStatus.APPROVED },
    ]);

    const response = await getForbiddenResponse();
    expect(response.state).toBe('INCOMPLETE');
    expect(response.missing).toContain('vehicle');
    expect(response.missing).toContain('document:DNI_BACK');
  });

  it('treats a not-yet-persisted user as incomplete instead of crashing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.document.findMany.mockResolvedValue([]);

    await expect(guard.canActivate(buildContext('user-1'))).rejects.toThrow(ForbiddenException);
  });
});
