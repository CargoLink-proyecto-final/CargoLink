import { BodyType } from '@prisma/client';

// Lo que la carga le exige al vehículo. Carrocería null = cualquiera.
export interface LoadVehicleRequirements {
  requiredBodyType: BodyType | null;
  requiresRefrigeration: boolean;
  requiresHazmat: boolean;
  weight: number;
  volume: number | null;
}

export interface VehicleCapabilities {
  bodyType: BodyType;
  refrigerated: boolean;
  hazardousMaterials: boolean;
  maxWeightKg: number;
  maxVolumeM3: number | null;
}

export type IncompatibilityReason = 'BODY_TYPE' | 'REFRIGERATION' | 'HAZMAT' | 'WEIGHT' | 'VOLUME';

const BODY_TYPE_LABELS: Record<BodyType, string> = {
  CERRADA: 'cerrada',
  ABIERTA: 'abierta',
  VOLCADORA: 'volcadora',
  CISTERNA: 'cisterna',
};

export function describeIncompatibility(
  reasons: IncompatibilityReason[],
  load: Pick<LoadVehicleRequirements, 'requiredBodyType'>,
): string {
  const messages: Record<IncompatibilityReason, string> = {
    BODY_TYPE: `la carga requiere carrocería ${load.requiredBodyType ? BODY_TYPE_LABELS[load.requiredBodyType] : ''}`.trim(),
    REFRIGERATION: 'la carga requiere vehículo refrigerado',
    HAZMAT: 'la carga requiere habilitación para cargas peligrosas',
    WEIGHT: 'el peso supera la capacidad de carga del vehículo',
    VOLUME: 'el volumen supera la capacidad del vehículo',
  };
  return reasons.map((r) => messages[r]).join('; ');
}

// Función pura: única fuente de verdad de "este vehículo sirve para esta
// carga". La usan la postulación (bloquea) y el filtro de cargas compatibles.
// El tamaño no se pide explícito: lo deciden peso y volumen contra la
// capacidad. El volumen solo se compara si ambos lados lo declararon: sin dato
// no hay cómo afirmar que no entra.
export function checkVehicleCompatibility(
  load: LoadVehicleRequirements,
  vehicle: VehicleCapabilities,
): IncompatibilityReason[] {
  const reasons: IncompatibilityReason[] = [];

  if (load.requiredBodyType && load.requiredBodyType !== vehicle.bodyType) reasons.push('BODY_TYPE');
  if (load.requiresRefrigeration && !vehicle.refrigerated) reasons.push('REFRIGERATION');
  if (load.requiresHazmat && !vehicle.hazardousMaterials) reasons.push('HAZMAT');
  if (load.weight > vehicle.maxWeightKg) reasons.push('WEIGHT');
  if (load.volume != null && vehicle.maxVolumeM3 != null && load.volume > vehicle.maxVolumeM3) {
    reasons.push('VOLUME');
  }

  return reasons;
}

// Mismo criterio que checkVehicleCompatibility, expresado como filtro de
// Prisma para listar solo las cargas que el vehículo puede llevar sin traer
// todo a memoria.
export function compatibleLoadsWhere(vehicle: VehicleCapabilities) {
  const and: Record<string, unknown>[] = [
    { OR: [{ requiredBodyType: null }, { requiredBodyType: vehicle.bodyType }] },
    { weight: { lte: vehicle.maxWeightKg } },
  ];
  if (!vehicle.refrigerated) and.push({ requiresRefrigeration: false });
  if (!vehicle.hazardousMaterials) and.push({ requiresHazmat: false });
  if (vehicle.maxVolumeM3 != null) {
    and.push({ OR: [{ volume: null }, { volume: { lte: vehicle.maxVolumeM3 } }] });
  }
  return and;
}
