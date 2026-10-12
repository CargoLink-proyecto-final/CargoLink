import { BodyType } from '@prisma/client';
import {
  checkVehicleCompatibility,
  compatibleLoadsWhere,
  describeIncompatibility,
} from './vehicle-compatibility';

describe('checkVehicleCompatibility', () => {
  const load = {
    requiredBodyType: null as BodyType | null,
    requiresRefrigeration: false,
    requiresHazmat: false,
    weight: 5000,
    volume: null as number | null,
  };
  const vehicle = {
    bodyType: BodyType.ABIERTA as BodyType,
    refrigerated: false,
    hazardousMaterials: false,
    maxWeightKg: 12000,
    maxVolumeM3: null as number | null,
  };

  it('accepts any vehicle when the load has no requirements and fits the capacity', () => {
    expect(checkVehicleCompatibility(load, vehicle)).toEqual([]);
  });

  it('requires the exact body type when the load asks for one', () => {
    expect(checkVehicleCompatibility({ ...load, requiredBodyType: BodyType.CERRADA }, vehicle)).toEqual([
      'BODY_TYPE',
    ]);
    expect(
      checkVehicleCompatibility(
        { ...load, requiredBodyType: BodyType.CERRADA },
        { ...vehicle, bodyType: BodyType.CERRADA },
      ),
    ).toEqual([]);
  });

  it('requires refrigeration and hazmat only when the load asks for them', () => {
    const demanding = { ...load, requiresRefrigeration: true, requiresHazmat: true };
    expect(checkVehicleCompatibility(demanding, vehicle)).toEqual(['REFRIGERATION', 'HAZMAT']);
    expect(
      checkVehicleCompatibility(demanding, { ...vehicle, refrigerated: true, hazardousMaterials: true }),
    ).toEqual([]);
    expect(checkVehicleCompatibility(load, { ...vehicle, refrigerated: true })).toEqual([]);
  });

  it('rejects a load heavier than the vehicle capacity (equal is fine)', () => {
    expect(checkVehicleCompatibility({ ...load, weight: 12001 }, vehicle)).toEqual(['WEIGHT']);
    expect(checkVehicleCompatibility({ ...load, weight: 12000 }, vehicle)).toEqual([]);
  });

  it('compares volume only when both sides declared it', () => {
    expect(checkVehicleCompatibility({ ...load, volume: 50 }, vehicle)).toEqual([]);
    expect(checkVehicleCompatibility(load, { ...vehicle, maxVolumeM3: 30 })).toEqual([]);
    expect(checkVehicleCompatibility({ ...load, volume: 50 }, { ...vehicle, maxVolumeM3: 30 })).toEqual([
      'VOLUME',
    ]);
  });

  it('describes every reason in Spanish, naming the required body type', () => {
    expect(
      describeIncompatibility(['BODY_TYPE', 'REFRIGERATION', 'WEIGHT'], { requiredBodyType: BodyType.CISTERNA }),
    ).toBe(
      'la carga requiere carrocería cisterna; la carga requiere vehículo refrigerado; el peso supera la capacidad de carga del vehículo',
    );
  });
});

describe('compatibleLoadsWhere', () => {
  const vehicle = {
    bodyType: BodyType.CERRADA as BodyType,
    refrigerated: true,
    hazardousMaterials: false,
    maxWeightKg: 3500,
    maxVolumeM3: 20 as number | null,
  };

  it('filters by body type, capacity and the specs the vehicle lacks', () => {
    expect(compatibleLoadsWhere(vehicle)).toEqual([
      { OR: [{ requiredBodyType: null }, { requiredBodyType: BodyType.CERRADA }] },
      { weight: { lte: 3500 } },
      { requiresHazmat: false },
      { OR: [{ volume: null }, { volume: { lte: 20 } }] },
    ]);
  });

  it('skips the volume filter when the vehicle did not declare it', () => {
    const where = compatibleLoadsWhere({ ...vehicle, maxVolumeM3: null });
    expect(JSON.stringify(where)).not.toContain('volume');
  });
});
