import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertVehicleDto } from './upsert-vehicle.dto';

function baseVehicle(overrides: Partial<UpsertVehicleDto> = {}) {
  return plainToInstance(UpsertVehicleDto, {
    plate: 'AB123CD',
    brand: 'Mercedes-Benz',
    model: 'Actros',
    year: 2019,
    unit: 'CHASIS',
    bodyType: 'CERRADA',
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

describe('UpsertVehicleDto — unit / bodyType', () => {
  it('accepts every unit and body type', async () => {
    for (const unit of ['CAMIONETA', 'CHASIS', 'BALANCIN', 'SEMIRREMOLQUE']) {
      for (const bodyType of ['CERRADA', 'ABIERTA', 'VOLCADORA', 'CISTERNA']) {
        const errors = await validate(baseVehicle({ unit, bodyType } as Partial<UpsertVehicleDto>));
        expect(errors.filter((e) => ['unit', 'bodyType'].includes(e.property))).toHaveLength(0);
      }
    }
  });

  it('rejects the old mixed vehicle types', async () => {
    const errors = await validate(
      baseVehicle({ unit: 'CAMION', bodyType: 'FURGON' } as unknown as Partial<UpsertVehicleDto>),
    );
    expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(['unit', 'bodyType']));
  });

  it('requires both', async () => {
    const errors = await validate(
      baseVehicle({ unit: undefined, bodyType: undefined } as unknown as Partial<UpsertVehicleDto>),
    );
    expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(['unit', 'bodyType']));
  });
});
