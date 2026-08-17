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
