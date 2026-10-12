import {
  describeRequirements,
  hasRequirements,
  requirementsOf,
  suggestedRequirements,
  vehicleIncompatibilities,
} from './vehicleRequirements';

const vehicle = {
  bodyType: 'ABIERTA' as const,
  refrigerated: false,
  hazardousMaterials: false,
  maxWeightKg: 12000,
  maxVolumeM3: 40,
};

const load = (overrides: Record<string, unknown> = {}) => ({
  weight: 5000,
  volume: 10,
  requiredBodyType: null,
  requiresRefrigeration: false,
  requiresHazmat: false,
  ...overrides,
});

describe('vehicleRequirements', () => {
  it('treats loads created before the feature (no fields) as having no requirements', () => {
    const req = requirementsOf({});
    expect(hasRequirements(req)).toBe(false);
    expect(describeRequirements(req)).toEqual([]);
  });

  it('suggests a body type from the cargo category, and none when it is ambiguous', () => {
    expect(suggestedRequirements('Electrónica y tecnología').requiredBodyType).toBe('CERRADA');
    expect(suggestedRequirements('Maquinaria e industria').requiredBodyType).toBe('ABIERTA');
    // Cemento en bolsas o arena a granel: no se puede decidir por la categoría.
    expect(suggestedRequirements('Materiales de construcción').requiredBodyType).toBeNull();
    expect(suggestedRequirements(undefined).requiredBodyType).toBeNull();
  });

  it('never suggests cold or hazmat: those depend on the actual goods', () => {
    expect(suggestedRequirements('Alimentos y bebidas')).toMatchObject({
      requiresRefrigeration: false,
      requiresHazmat: false,
    });
  });

  it('describes the requirements in Spanish', () => {
    expect(
      describeRequirements(requirementsOf({ requiredBodyType: 'CISTERNA', requiresHazmat: true })),
    ).toEqual(['Carrocería cisterna', 'Cargas peligrosas']);
  });

  it('accepts a vehicle that meets everything', () => {
    expect(vehicleIncompatibilities(load({ requiredBodyType: 'ABIERTA' }), vehicle)).toEqual([]);
  });

  it('lists each reason the vehicle does not fit, naming both body types', () => {
    expect(
      vehicleIncompatibilities(
        load({ requiredBodyType: 'CERRADA', requiresRefrigeration: true, weight: 13000, volume: 50 }),
        vehicle,
      ),
    ).toEqual([
      'Requiere carrocería cerrada (la tuya es abierta)',
      'Requiere vehículo refrigerado',
      'El peso supera la capacidad de tu vehículo',
      'El volumen supera la capacidad de tu vehículo',
    ]);
  });

  it('skips the volume check when the vehicle did not declare its volume', () => {
    expect(vehicleIncompatibilities(load({ volume: 999 }), { ...vehicle, maxVolumeM3: null })).toEqual([]);
  });
});
