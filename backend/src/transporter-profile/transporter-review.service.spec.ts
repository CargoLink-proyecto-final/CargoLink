import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Role } from '@prisma/client';
import { TransporterReviewService } from './transporter-review.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { REQUIRED_DOCUMENT_TYPES } from './profile-completeness';

describe('TransporterReviewService', () => {
  let service: TransporterReviewService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    vehicle: { findUnique: jest.Mock };
    document: { findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailService: { sendDocumentsRejectedEmail: jest.Mock; sendProfileApprovedEmail: jest.Mock };

  const completeUser = {
    cuit: '20-12345678-3',
    licenseCategory: 'E1',
    licenseExpiresAt: new Date('2027-01-01'),
    termsAcceptedAt: new Date('2026-01-01'),
  };
  const transporter = { id: 'user-1', email: 'carrier@test.com', firstName: 'Ana', role: Role.TRANSPORTER };
  const documents = REQUIRED_DOCUMENT_TYPES.map((type) => ({ id: `doc-${type}`, type }));

  // findUnique de user se llama dos veces por cada loadProfileStatus (antes y
  // después de revisar) además del chequeo inicial: el mock devuelve un objeto
  // que sirve para todas.
  const mockProfileReads = (before: DocumentStatus, after: DocumentStatus) => {
    prisma.user.findUnique.mockResolvedValue({ ...transporter, ...completeUser });
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.document.findMany
      // 1) documentos a revisar (validación de pertenencia): solo los pedidos
      .mockImplementationOnce(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(documents.filter((d) => where.id.in.includes(d.id))),
      )
      // 2) estado antes
      .mockResolvedValueOnce(REQUIRED_DOCUMENT_TYPES.map((type) => ({ type, status: before })))
      // 3) estado después
      .mockResolvedValueOnce(REQUIRED_DOCUMENT_TYPES.map((type) => ({ type, status: after })));
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      vehicle: { findUnique: jest.fn() },
      document: { findMany: jest.fn(), update: jest.fn((args) => args) },
      $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
    };
    mailService = {
      sendDocumentsRejectedEmail: jest.fn().mockResolvedValue(undefined),
      sendProfileApprovedEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransporterReviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(TransporterReviewService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getQueue', () => {
    it('returns transporters waiting longest first, with their verification state', async () => {
      const older = new Date('2026-10-01');
      const newer = new Date('2026-10-05');
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'recent',
          ...completeUser,
          vehicle: { plate: 'AA111AA', unit: 'CHASIS', bodyType: 'ABIERTA' },
          documents: [{ type: DocumentType.DNI_FRONT, status: DocumentStatus.PENDING, updatedAt: newer }],
        },
        {
          id: 'waiting',
          ...completeUser,
          vehicle: { plate: 'BB222BB', unit: 'CHASIS', bodyType: 'CERRADA' },
          documents: REQUIRED_DOCUMENT_TYPES.map((type) => ({
            type,
            status: DocumentStatus.PENDING,
            updatedAt: older,
          })),
        },
      ]);

      const queue = await service.getQueue();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: Role.TRANSPORTER, documents: { some: { status: DocumentStatus.PENDING } } },
        }),
      );
      expect(queue.map((q) => q.id)).toEqual(['waiting', 'recent']);
      expect(queue[0]).toMatchObject({ state: 'PENDING_REVIEW', complete: true, pendingCount: 8 });
      expect(queue[1]).toMatchObject({ state: 'INCOMPLETE', pendingCount: 1 });
      expect(queue[0]).not.toHaveProperty('cuit');
    });
  });

  describe('getProfile', () => {
    it('throws NotFoundException for a user who is not a transporter', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...transporter, role: Role.CARGO_GENERATOR });
      await expect(service.getProfile('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('review', () => {
    it('approves every document, stamps the reviewer and emails the approval once', async () => {
      mockProfileReads(DocumentStatus.PENDING, DocumentStatus.APPROVED);

      const status = await service.review('user-1', 'admin-1', {
        decisions: documents.map((d) => ({ documentId: d.id, status: 'APPROVED' as const })),
      });

      expect(prisma.document.update).toHaveBeenCalledTimes(documents.length);
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-DNI_FRONT' },
        data: expect.objectContaining({
          status: 'APPROVED',
          rejectionReason: null,
          reviewedById: 'admin-1',
          reviewedAt: expect.any(Date),
        }),
      });
      expect(status?.approved).toBe(true);
      expect(mailService.sendProfileApprovedEmail).toHaveBeenCalledWith('carrier@test.com', 'Ana');
      expect(mailService.sendDocumentsRejectedEmail).not.toHaveBeenCalled();
    });

    it('does not re-send the approval email when the profile was already approved', async () => {
      mockProfileReads(DocumentStatus.APPROVED, DocumentStatus.APPROVED);

      await service.review('user-1', 'admin-1', {
        decisions: [{ documentId: 'doc-VTV', status: 'APPROVED' }],
      });

      expect(mailService.sendProfileApprovedEmail).not.toHaveBeenCalled();
    });

    it('stores the trimmed reason and emails every rejection in a single message', async () => {
      mockProfileReads(DocumentStatus.PENDING, DocumentStatus.PENDING);

      await service.review('user-1', 'admin-1', {
        decisions: [
          { documentId: 'doc-VTV', status: 'REJECTED', reason: '  Vencida  ' },
          { documentId: 'doc-INSURANCE', status: 'REJECTED', reason: 'Ilegible' },
          { documentId: 'doc-DNI_FRONT', status: 'APPROVED' },
        ],
      });

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-VTV' },
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Vencida' }),
      });
      expect(mailService.sendDocumentsRejectedEmail).toHaveBeenCalledTimes(1);
      expect(mailService.sendDocumentsRejectedEmail).toHaveBeenCalledWith('carrier@test.com', 'Ana', [
        { label: 'VTV', reason: 'Vencida' },
        { label: 'Seguro', reason: 'Ilegible' },
      ]);
    });

    it('keeps the review even if the email fails', async () => {
      mockProfileReads(DocumentStatus.PENDING, DocumentStatus.APPROVED);
      mailService.sendProfileApprovedEmail.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.review('user-1', 'admin-1', {
          decisions: documents.map((d) => ({ documentId: d.id, status: 'APPROVED' as const })),
        }),
      ).resolves.toMatchObject({ approved: true });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects documents that do not belong to the transporter', async () => {
      prisma.user.findUnique.mockResolvedValue(transporter);
      prisma.document.findMany.mockResolvedValueOnce([]);

      await expect(
        service.review('user-1', 'admin-1', {
          decisions: [{ documentId: 'someone-elses-doc', status: 'APPROVED' }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects duplicated decisions for the same document', async () => {
      prisma.user.findUnique.mockResolvedValue(transporter);

      await expect(
        service.review('user-1', 'admin-1', {
          decisions: [
            { documentId: 'doc-VTV', status: 'APPROVED' },
            { documentId: 'doc-VTV', status: 'REJECTED', reason: 'x' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the user is not a transporter', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.review('ghost', 'admin-1', { decisions: [{ documentId: 'd', status: 'APPROVED' }] }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
