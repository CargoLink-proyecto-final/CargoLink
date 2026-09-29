import type { LngLatBounds } from '@maplibre/maplibre-react-native';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Caja que contiene a todos los puntos, en el orden que espera MapLibre:
 * `[west, south, east, north]`.
 *
 * `minSpan` existe porque `fitBounds` con una caja de área cero (todos los
 * puntos en la misma coordenada, o un único viaje que todavía no se movió del
 * origen) deja la cámara en un zoom absurdo. En ese caso se infla la caja para
 * que el mapa muestre el entorno del punto.
 */
export function boundsFor(points: LatLng[], minSpan = 0.02): LngLatBounds | null {
  if (points.length === 0) return null;

  let west = points[0].longitude;
  let east = points[0].longitude;
  let south = points[0].latitude;
  let north = points[0].latitude;

  for (const { latitude, longitude } of points) {
    if (longitude < west) west = longitude;
    if (longitude > east) east = longitude;
    if (latitude < south) south = latitude;
    if (latitude > north) north = latitude;
  }

  if (east - west < minSpan) {
    const center = (east + west) / 2;
    west = center - minSpan / 2;
    east = center + minSpan / 2;
  }

  if (north - south < minSpan) {
    const center = (north + south) / 2;
    south = center - minSpan / 2;
    north = center + minSpan / 2;
  }

  return [west, south, east, north];
}
