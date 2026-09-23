import { DocumentType } from '@prisma/client';
import { computeProfileStatus, REQUIRED_DOCUMENT_TYPES } from './profile-completeness';

describe('computeProfileStatus', () => {
  const completeUser = {
    cuit: '20-12345678-3',
    licenseCategory: 'E1',
    licenseExpiresAt: new Date('2027-01-01'),
    termsAcceptedAt: new Date('2026-01-01'),
  };

  it('is complete when every field, the vehicle and all required documents are present', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: true,
      documentTypes: REQUIRED_DOCUMENT_TYPES,
    });

    expect(status).toEqual({ complete: true, missing: [] });
  });

  it('lists each missing user field', () => {
    const status = computeProfileStatus({
      user: { cuit: null, licenseCategory: null, licenseExpiresAt: null, termsAcceptedAt: null },
      hasVehicle: true,
      documentTypes: REQUIRED_DOCUMENT_TYPES,
    });

    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(
      expect.arrayContaining(['cuit', 'licenseCategory', 'licenseExpiresAt', 'termsAccepted']),
    );
  });

  it('flags a missing vehicle', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: false,
      documentTypes: REQUIRED_DOCUMENT_TYPES,
    });

    expect(status.missing).toContain('vehicle');
  });

  it('flags each missing required document by type', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: true,
      documentTypes: [DocumentType.DNI_FRONT],
    });

    expect(status.complete).toBe(false);
    expect(status.missing).toContain('document:DNI_BACK');
    expect(status.missing).not.toContain('document:DNI_FRONT');
  });

  it('ignores document types that are not required (e.g. RUTA is not part of the model yet)', () => {
    const status = computeProfileStatus({
      user: completeUser,
      hasVehicle: true,
      documentTypes: REQUIRED_DOCUMENT_TYPES,
    });

    expect(status.complete).toBe(true);
  });
});
