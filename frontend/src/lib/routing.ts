/**
 * Fetches a driving route from OSRM (Open Source Routing Machine).
 * Free, no API key required. Uses OpenStreetMap data.
 *
 * Returns an array of [lat, lng] coordinate pairs representing the route.
 */
export async function fetchRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<[number, number][]> {
  try {
    // OSRM expects coordinates as lng,lat (reversed from our usual lat,lng)
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[OSRM] Response not ok:', res.status);
      return makeStraightLine(originLat, originLng, destLat, destLng);
    }

    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) {
      console.warn('[OSRM] No routes returned:', data.code);
      return makeStraightLine(originLat, originLng, destLat, destLng);
    }

    // GeoJSON coordinates are [lng, lat] — convert to [lat, lng] for Leaflet
    const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
    );

    return coords;
  } catch (err) {
    console.warn('[OSRM] Fetch failed:', err);
    return makeStraightLine(originLat, originLng, destLat, destLng);
  }
}

/**
 * Fallback: returns a straight line between origin and destination
 * when the OSRM API is unavailable.
 */
function makeStraightLine(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): [number, number][] {
  return [
    [originLat, originLng],
    [destLat, destLng],
  ];
}
