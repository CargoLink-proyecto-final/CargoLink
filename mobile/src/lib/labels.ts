// Espejo de frontend/src/lib/utils.ts. Mobile y web no comparten código, así que
// los labels visibles se duplican acá para que ambas apps digan lo mismo.

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

const STATUS_LABELS: Record<string, string> = {
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

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

/**
 * Estado unificado de la "solicitud" (ciclo Load + Trip combinado).
 *
 * Una solicitud nace cuando el publicador crea la carga y se sigue como un
 * único hilo de 4 estados — Creado → Asignado → Iniciado → Completado (+
 * Cancelado) — aunque internamente ese hilo viva partido entre `LoadStatus` y
 * `TripStatus`. El backend mantiene ambos enums sincronizados de forma atómica,
 * así que el stage se deriva indistintamente del status de Load o de Trip.
 *
 * IMPORTANTE: este mapeo es OPT-IN. `PENDING`/`ACCEPTED`/`COMPLETED` también
 * son valores de `PostulationStatus`, donde significan otra cosa — por eso
 * nunca debe aplicarse a badges de postulaciones.
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

/** Color por stage, alineado con los tonos que usa el StatusBadge del web. */
const SOLICITUD_STAGE_COLORS: Record<SolicitudStage, string> = {
  CREATED: '#3b82f6',
  ASSIGNED: '#f59e0b',
  STARTED: '#f97316',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
};

export function getSolicitudStage(status: string): SolicitudStage | null {
  return SOLICITUD_STAGE_BY_STATUS[status] ?? null;
}

export function getSolicitudStageLabel(status: string): string {
  const stage = getSolicitudStage(status);
  return stage ? SOLICITUD_STAGE_LABELS[stage] : getStatusLabel(status);
}

export function getSolicitudStageColor(status: string): string {
  const stage = getSolicitudStage(status);
  return stage ? SOLICITUD_STAGE_COLORS[stage] : '#6b7280';
}

const ROLE_LABELS: Record<string, string> = {
  CARGO_GENERATOR: 'Publicador de carga',
  TRANSPORTER: 'Transportista',
  ADMIN: 'Administrador',
  COMPANY_ADMIN: 'Administrador de empresa',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}
