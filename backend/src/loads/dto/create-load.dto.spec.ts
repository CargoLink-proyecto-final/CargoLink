import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLoadDto } from './create-load.dto';
import { CARGO_TYPES } from '../cargo-types.constant';

// Reproduce lo mínimo necesario para que solo el campo cargoType determine
// si el DTO es válido — el resto de los campos requeridos van con valores dummy.
function baseLoad(overrides: Partial<CreateLoadDto> = {}) {
  return plainToInstance(CreateLoadDto, {
    title: 'Carga de prueba',
    originAddress: 'Av. Corrientes 1234, CABA',
    originLat: -34.6037,
    originLng: -58.3816,
    destAddress: 'Av. San Martín 567, Córdoba',
    destLat: -31.4201,
    destLng: -64.1888,
    cargoType: 'Mercadería general',
    weight: 1000,
    pickupDate: new Date().toISOString(),
    price: 10000,
    ...overrides,
  });
}

describe('CreateLoadDto — cargoType whitelist', () => {
  it.each(CARGO_TYPES)('accepts the taxonomy category "%s"', async (cargoType) => {
    const errors = await validate(baseLoad({ cargoType }));
    expect(errors.filter((e) => e.property === 'cargoType')).toHaveLength(0);
  });

  it('rejects free text outside the taxonomy (e.g. a value only entered via direct API calls)', async () => {
    const errors = await validate(baseLoad({ cargoType: 'BEBIDAS' }));
    const cargoTypeError = errors.find((e) => e.property === 'cargoType');
    expect(cargoTypeError).toBeDefined();
    expect(cargoTypeError?.constraints).toHaveProperty('isIn');
  });
});

describe('CreateLoadDto — price', () => {
  it('accepts a load published without a price ("a convenir")', async () => {
    const errors = await validate(baseLoad({ price: undefined }));
    expect(errors.filter((e) => e.property === 'price')).toHaveLength(0);
  });

  it('still rejects a negative price when one is sent', async () => {
    const errors = await validate(baseLoad({ price: -1 }));
    const priceError = errors.find((e) => e.property === 'price');
    expect(priceError?.constraints).toHaveProperty('min');
  });

  it('still rejects a non-numeric price', async () => {
    const errors = await validate(baseLoad({ price: 'gratis' as unknown as number }));
    expect(errors.find((e) => e.property === 'price')).toBeDefined();
  });
});

describe('CreateLoadDto — vehicle requirements', () => {
  it('accepts a list of vehicle types and the spec flags', async () => {
    const errors = await validate(
      baseLoad({
        requiredBodyType: 'CERRADA',
        requiresRefrigeration: true,
        requiresHazmat: false,
      } as Partial<CreateLoadDto>),
    );
    const requirementFields = [
      'requiredBodyType',
      'requiresRefrigeration',
      'requiresHazmat',
    ];
    expect(errors.filter((e) => requirementFields.includes(e.property))).toHaveLength(0);
  });

  it('rejects an unknown body type', async () => {
    const errors = await validate(baseLoad({ requiredBodyType: 'FURGON' } as unknown as Partial<CreateLoadDto>));
    expect(errors.find((e) => e.property === 'requiredBodyType')?.constraints).toHaveProperty('isEnum');
  });

  it('accepts null to mean any body type', async () => {
    const errors = await validate(baseLoad({ requiredBodyType: null }));
    expect(errors.find((e) => e.property === 'requiredBodyType')).toBeUndefined();
  });

  it('rejects a non-boolean spec flag', async () => {
    const errors = await validate(baseLoad({ requiresRefrigeration: 'si' } as unknown as Partial<CreateLoadDto>));
    expect(errors.find((e) => e.property === 'requiresRefrigeration')).toBeDefined();
  });
});
