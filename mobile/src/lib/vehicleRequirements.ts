// Espejo de frontend/src/lib/vehicleRequirements.ts (mobile y web no comparten
// código). El backend es el que bloquea la postulación; esto avisa antes.
//
// El publicador no elige vehículos: describe lo que necesita su carga
// (carrocería, frío, peligrosa) y el tamaño sale del peso y el volumen.

import { bodyTypeLabel } from './transporterProfile';
import { BodyType, Load, Vehicle } from '../types';

export interface VehicleRequirements {
  requiredBodyType: BodyType | null;
  requiresRefrigeration: boolean;
  requiresHazmat: boolean;
}

export const EMPTY_REQUIREMENTS: VehicleRequirements = {
  requiredBodyType: null,
  requiresRefrigeration: false,
  requiresHazmat: false,
};

// Carrocería sugerida por categoría. En los casos ambiguos (ej. materiales de
// construcción: arena a granel o cemento en bolsas) se sugiere "cualquiera".
const SUGGESTED_BODY_TYPE: Record<string, BodyType | null> = {
  'Electrónica y tecnología': 'CERRADA',
  'Alimentos y bebidas': 'CERRADA',
  'Muebles y artículos del hogar': 'CERRADA',
  'Ropa y textiles': 'CERRADA',
  'Maquinaria e industria': 'ABIERTA',
  'Materiales de construcción': null,
  'Mercadería general': null,
  Otro: null,
};

export function suggestedBodyType(cargoType: string | undefined): BodyType | null {
  return (cargoType && SUGGESTED_BODY_TYPE[cargoType]) || null;
}

export function requirementsOf(load: Partial<Pick<Load, keyof VehicleRequirements>>): VehicleRequirements {
  return {
    requiredBodyType: load.requiredBodyType ?? null,
    requiresRefrigeration: !!load.requiresRefrigeration,
    requiresHazmat: !!load.requiresHazmat,
  };
}

export function describeRequirements(req: VehicleRequirements): string[] {
  const parts: string[] = [];
  if (req.requiredBodyType) parts.push(`Carrocería ${bodyTypeLabel(req.requiredBodyType).toLowerCase()}`);
  if (req.requiresRefrigeration) parts.push('Refrigerado');
  if (req.requiresHazmat) parts.push('Cargas peligrosas');
  return parts;
}

export function vehicleIncompatibilities(
  load: Pick<Load, 'weight' | 'volume'> & Partial<Pick<Load, keyof VehicleRequirements>>,
  vehicle: Pick<Vehicle, 'bodyType' | 'refrigerated' | 'hazardousMaterials' | 'maxWeightKg' | 'maxVolumeM3'>,
): string[] {
  const req = requirementsOf(load);
  const reasons: string[] = [];
  if (req.requiredBodyType && req.requiredBodyType !== vehicle.bodyType) {
    reasons.push(
      `Requiere carrocería ${bodyTypeLabel(req.requiredBodyType).toLowerCase()} (la tuya es ${bodyTypeLabel(vehicle.bodyType).toLowerCase()})`,
    );
  }
  if (req.requiresRefrigeration && !vehicle.refrigerated) reasons.push('Requiere vehículo refrigerado');
  if (req.requiresHazmat && !vehicle.hazardousMaterials) reasons.push('Requiere habilitación para cargas peligrosas');
  if (load.weight > vehicle.maxWeightKg) reasons.push('El peso supera la capacidad de tu vehículo');
  if (load.volume != null && vehicle.maxVolumeM3 != null && load.volume > vehicle.maxVolumeM3) {
    reasons.push('El volumen supera la capacidad de tu vehículo');
  }
  return reasons;
}
