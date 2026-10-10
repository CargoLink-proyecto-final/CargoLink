import { DocumentStatus, DocumentType } from '@prisma/client';
import { computeProfileStatus, REQUIRED_DOCUMENT_TYPES } from './profile-completeness';

describe('computeProfileStatus', () => {
  const completeUser = {
    cuit: '20-12345678-3',
    licenseCategory: 'E1',
    licenseExpiresAt: new Date('2027-01-01'),
    termsAcceptedAt: new Date('2026-01-01'),
  };

  const allDocuments = (status: DocumentStatus) =>
    REQUIRED_DOCUMENT_TYPES.map((type) => ({ type, status }));

  it('is complete and approved when everything is present and every document is approved', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: true,
      documents: allDocuments(DocumentStatus.APPROVED),
    });

    expect(status).toEqual({
      complete: true,
      approved: true,
      state: 'APPROVED',
      missing: [],
      pendingReview: [],
      rejected: [],
    });
  });

  it('is complete but pending review while documents await the admin', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: true,
      documents: allDocuments(DocumentStatus.PENDING),
    });

    expect(status.complete).toBe(true);
    expect(status.approved).toBe(false);
    expect(status.state).toBe('PENDING_REVIEW');
    expect(status.pendingReview).toEqual(REQUIRED_DOCUMENT_TYPES);
  });

  it('reports rejected documents and prioritises that state over missing pieces', () => {
    const status = computeProfileStatus({
      user: { ...completeUser, cuit: null },
      hasVehicle: true,
      documents: [
        ...allDocuments(DocumentStatus.APPROVED).filter((d) => d.type !== DocumentType.DNI_FRONT),
        { type: DocumentType.DNI_FRONT, status: DocumentStatus.REJECTED },
      ],
    });

    expect(status.approved).toBe(false);
    expect(status.state).toBe('REJECTED');
    expect(status.rejected).toEqual([DocumentType.DNI_FRONT]);
    expect(status.missing).toContain('cuit');
  });

  it('lists each missing user field', () => {
    const status = computeProfileStatus({
      user: { cuit: null, licenseCategory: null, licenseExpiresAt: null, termsAcceptedAt: null },
      hasVehicle: true,
      documents: allDocuments(DocumentStatus.APPROVED),
    });

    expect(status.complete).toBe(false);
    expect(status.approved).toBe(false);
    expect(status.state).toBe('INCOMPLETE');
    expect(status.missing).toEqual(
      expect.arrayContaining(['cuit', 'licenseCategory', 'licenseExpiresAt', 'termsAccepted']),
    );
  });

  it('flags a missing vehicle', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: false,
      documents: allDocuments(DocumentStatus.APPROVED),
    });

    expect(status.missing).toContain('vehicle');
  });

  it('flags each missing required document by type', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: true,
      documents: [{ type: DocumentType.DNI_FRONT, status: DocumentStatus.PENDING }],
    });

    expect(status.complete).toBe(false);
    expect(status.missing).toContain('document:DNI_BACK');
    expect(status.missing).not.toContain('document:DNI_FRONT');
  });
});
