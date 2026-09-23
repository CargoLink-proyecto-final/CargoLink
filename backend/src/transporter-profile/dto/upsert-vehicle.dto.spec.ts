import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertVehicleDto } from './upsert-vehicle.dto';

function baseVehicle(overrides: Partial<UpsertVehicleDto> = {}) {
  return plainToInstance(UpsertVehicleDto, {
    plate: 'AB123CD',
    brand: 'Mercedes-Benz',
    model: 'Actros',
    year: 2019,
    type: 'CAMION',
    maxWeightKg: 12000,
    ...overrides,
  });
}

describe('UpsertVehicleDto — insuranceExpiresAt / vtvExpiresAt', () => {
  it('accepts omitting both (optional fields)', async () => {
    const errors = await validate(baseVehicle());
    expect(errors.filter((e) => ['insuranceExpiresAt', 'vtvExpiresAt'].includes(e.property))).toHaveLength(0);
  });

  it('accepts future dates for both', async () => {
    const errors = await validate(
      baseVehicle({ insuranceExpiresAt: '2099-01-01', vtvExpiresAt: '2099-01-01' }),
    );
    expect(errors.filter((e) => ['insuranceExpiresAt', 'vtvExpiresAt'].includes(e.property))).toHaveLength(0);
  });

  it('rejects an already-expired seguro', async () => {
    const errors = await validate(baseVehicle({ insuranceExpiresAt: '2020-01-01' }));
    const error = errors.find((e) => e.property === 'insuranceExpiresAt');
    expect(error?.constraints).toHaveProperty('isFutureDate');
  });

  it('rejects an already-expired VTV', async () => {
    const errors = await validate(baseVehicle({ vtvExpiresAt: '2020-01-01' }));
    const error = errors.find((e) => e.property === 'vtvExpiresAt');
    expect(error?.constraints).toHaveProperty('isFutureDate');
  });
});
