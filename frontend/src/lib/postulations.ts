import type { PostulationWithLoad, PostulationStatus } from '@/types';

/**
 * Estados en los que la postulación sigue viva: nadie la cerró todavía.
 *
 * Aceptar una postulación crea el Trip en la misma transacción del backend
 * (postulations.service.ts → accept), así que una postulación ACCEPTED es
 * siempre el espejo de un viaje que ya aparece en "Mis Viajes". Listarla acá
 * duplicaría esa pantalla, y lo mismo vale para las ya cerradas.
 */
export const OPEN_POSTULATION_STATUSES: PostulationStatus[] = ['PENDING', 'NEGOTIATING'];

export function isOpenPostulation(postulation: PostulationWithLoad): boolean {
  return OPEN_POSTULATION_STATUSES.includes(postulation.status);
}

/**
 * Una postulación "espera tu respuesta" cuando quedó en negociación y la última
 * oferta la puso el dador de carga: la pelota está del lado del transportista,
 * que tiene que aceptar o recontraofertar.
 *
 * Es el único criterio que se limpia solo cuando el transportista actúa, así que
 * es el que alimenta el badge del sidebar (el modelo Postulation no tiene flag
 * de leído/visto como sí lo tienen los mensajes).
 */
export function awaitsCarrierReply(postulation: PostulationWithLoad): boolean {
  return postulation.status === 'NEGOTIATING' && postulation.lastOfferBy === 'SHIPPER';
}

export function countAwaitingCarrierReply(postulations: PostulationWithLoad[]): number {
  return postulations.filter(awaitsCarrierReply).length;
}
