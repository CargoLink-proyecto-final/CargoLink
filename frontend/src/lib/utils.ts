import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
}

/**
 * El precio de una carga es opcional: si el publicador no lo fija, sale
 * "a convenir" y lo define la postulación del transportista.
 */
export const PRICE_TO_AGREE_LABEL = 'A convenir';

export function formatPrice(amount?: number | null): string {
  return amount == null ? PRICE_TO_AGREE_LABEL : formatCurrency(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PUBLISHED: 'bg-blue-100 text-blue-800',
    ASSIGNED: 'bg-yellow-100 text-yellow-800',
    IN_TRANSIT: 'bg-orange-100 text-orange-800',
    DELIVERED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
    PENDING: 'bg-gray-100 text-gray-800',
    ACCEPTED: 'bg-blue-100 text-blue-800',
    IN_PROGRESS: 'bg-orange-100 text-orange-800',
    COMPLETED: 'bg-green-100 text-green-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Pendiente',
    ACTIVE: 'Activo',
    COMPLETED: 'Completado',
    CANCELLED: 'Cancelado',
    IN_TRANSIT: 'En Tránsito',
    DELIVERED: 'Entregado',
    PUBLISHED: 'Publicado',
    ASSIGNED: 'Asignado',
    ACCEPTED: 'Aceptado',
    NEGOTIATING: 'En negociación',
    IN_PROGRESS: 'En Progreso',
    REJECTED: 'Rechazada',
    WITHDRAWN: 'Retirada',
    APPROVED: 'Aprobada',
  };
  return labels[status] || status;
}

/**
 * Estado unificado de la "solicitud" (ciclo Load + Trip combinado).
 *
 * Una solicitud nace cuando el publicador crea la carga y se sigue como un
 * único hilo de 4 estados — Creado → Asignado → Iniciado → Completado (+
 * Cancelado) — aunque internamente ese hilo viva partido entre `LoadStatus` y
 * `TripStatus`. El backend mantiene ambos enums sincronizados de forma atómica
 * (aceptar postulación → ASSIGNED, iniciar viaje → IN_TRANSIT, completar →
 * DELIVERED), así que el stage se deriva indistintamente del status de Load o
 * de Trip.
 *
 * IMPORTANTE: este mapeo es OPT-IN. `PENDING`/`ACCEPTED`/`COMPLETED` también
 * son valores de `PostulationStatus`, donde significan otra cosa — por eso
 * nunca debe aplicarse a badges de postulaciones. Usar solo sobre estados de
 * carga/viaje.
 */
export type SolicitudStage =
  | 'CREATED'
  | 'ASSIGNED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

const SOLICITUD_STAGE_BY_STATUS: Record<string, SolicitudStage> = {
  // LoadStatus
  PUBLISHED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  IN_TRANSIT: 'STARTED',
  DELIVERED: 'COMPLETED',
  // TripStatus
  PENDING: 'CREATED',
  ACCEPTED: 'ASSIGNED',
  IN_PROGRESS: 'STARTED',
  COMPLETED: 'COMPLETED',
  // Compartido por ambos enums
  CANCELLED: 'CANCELLED',
};

const SOLICITUD_STAGE_LABELS: Record<SolicitudStage, string> = {
  CREATED: 'Creado',
  ASSIGNED: 'Asignado',
  STARTED: 'Iniciado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

/** Deriva el stage unificado de la solicitud desde un `LoadStatus` o `TripStatus`. */
export function getSolicitudStage(status: string): SolicitudStage | null {
  return SOLICITUD_STAGE_BY_STATUS[status] ?? null;
}

/** Etiqueta en español del ciclo de la solicitud (Creado/Asignado/Iniciado/Completado/Cancelado). */
export function getSolicitudStageLabel(status: string): string {
  const stage = getSolicitudStage(status);
  return stage ? SOLICITUD_STAGE_LABELS[stage] : getStatusLabel(status);
}
