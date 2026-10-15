import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto — licenseExpiresAt', () => {
  it('accepts omitting the field entirely', async () => {
    const errors = await validate(plainToInstance(UpdateProfileDto, {}));
    expect(errors.filter((e) => e.property === 'licenseExpiresAt')).toHaveLength(0);
  });

  it('accepts a future date', async () => {
    const errors = await validate(
      plainToInstance(UpdateProfileDto, { licenseExpiresAt: '2099-01-01' }),
    );
    expect(errors.filter((e) => e.property === 'licenseExpiresAt')).toHaveLength(0);
  });

  it('rejects an already-expired license', async () => {
    const errors = await validate(
      plainToInstance(UpdateProfileDto, { licenseExpiresAt: '2020-01-01' }),
    );
    const error = errors.find((e) => e.property === 'licenseExpiresAt');
    expect(error?.constraints).toHaveProperty('isFutureDate');
  });
});
