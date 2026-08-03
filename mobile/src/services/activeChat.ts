/**
 * Viaje cuya conversación está abierta en pantalla.
 *
 * Lo escribe `ChatScreen` al montarse y lo lee el listener global de mensajes,
 * que usa el dato para no tirar una notificación por un mensaje que el usuario
 * ya está viendo llegar en vivo.
 *
 * Es un módulo con estado y no un store de zustand a propósito: nadie tiene que
 * re-renderizar cuando esto cambia, sólo hace falta leerlo desde un callback.
 */
let activeTripId: string | null = null;

export function setActiveTripId(tripId: string | null): void {
  activeTripId = tripId;
}

export function getActiveTripId(): string | null {
  return activeTripId;
}
