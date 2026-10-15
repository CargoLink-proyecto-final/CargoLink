import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewProfileDto } from './review-profile.dto';

const DOC_ID = '6f1c2c8e-3b0a-4d2f-9a51-2f6f0e7c1a11';

const errorsFor = async (body: unknown) => {
  const errors = await validate(plainToInstance(ReviewProfileDto, body));
  return JSON.stringify(errors);
};

describe('ReviewProfileDto', () => {
  it('accepts an approval without reason', async () => {
    expect(await errorsFor({ decisions: [{ documentId: DOC_ID, status: 'APPROVED' }] })).toBe('[]');
  });

  it('requires a reason when rejecting', async () => {
    expect(await errorsFor({ decisions: [{ documentId: DOC_ID, status: 'REJECTED' }] })).toContain(
      'Indicá el motivo del rechazo',
    );
  });

  it('rejects a reason made only of whitespace', async () => {
    expect(
      await errorsFor({ decisions: [{ documentId: DOC_ID, status: 'REJECTED', reason: '   ' }] }),
    ).toContain('Indicá el motivo del rechazo');
  });

  it('trims the reason before storing it', () => {
    const dto = plainToInstance(ReviewProfileDto, {
      decisions: [{ documentId: DOC_ID, status: 'REJECTED', reason: '  Borrosa  ' }],
    });
    expect(dto.decisions[0].reason).toBe('Borrosa');
  });

  it('accepts a rejection with reason', async () => {
    expect(
      await errorsFor({ decisions: [{ documentId: DOC_ID, status: 'REJECTED', reason: 'Borrosa' }] }),
    ).toBe('[]');
  });

  it('rejects an unknown verdict and an empty decision list', async () => {
    expect(await errorsFor({ decisions: [{ documentId: DOC_ID, status: 'PENDING' }] })).toContain(
      'APPROVED o REJECTED',
    );
    expect(await errorsFor({ decisions: [] })).toContain('al menos una decisión');
  });
});
