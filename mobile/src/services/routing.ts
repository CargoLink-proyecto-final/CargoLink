/**
 * Fetches a driving route from OSRM (Open Source Routing Machine).
 * Returns an array of { latitude, longitude } for the MapLibre route line.
 * Falls back to a straight line if the API is unavailable.
 */
export async function fetchRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ latitude: number; longitude: number }[]> {
  try {
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

    return data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng }),
    );
  } catch (err) {
    console.warn('[OSRM] Fetch failed:', err);
    return makeStraightLine(originLat, originLng, destLat, destLng);
  }
}

function makeStraightLine(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): { latitude: number; longitude: number }[] {
  return [
    { latitude: originLat, longitude: originLng },
    { latitude: destLat, longitude: destLng },
  ];
}
