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

/**
 * Reverse-geocodes a coordinate pair into a human-readable address via
 * Nominatim. Returns null if the lookup fails.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Geocodes structured address components via Nominatim's structured
 * search. Yields better matches than free-text when callers can split
 * the address up. Returns null if no match.
 */
export async function geocodeStructured(parts: {
  street?: string;
  city?: string;
  state?: string;
  postalcode?: string;
}): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const params = new URLSearchParams({ format: 'json', limit: '1' });
  let hasField = false;
  if (parts.street?.trim()) { params.set('street', parts.street.trim()); hasField = true; }
  if (parts.city?.trim()) { params.set('city', parts.city.trim()); hasField = true; }
  if (parts.state?.trim()) { params.set('state', parts.state.trim()); hasField = true; }
  if (parts.postalcode?.trim()) { params.set('postalcode', parts.postalcode.trim()); hasField = true; }
  if (!hasField) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, displayName: data[0].display_name };
  } catch {
    return null;
  }
}

/**
 * Geocodes a free-text address into coordinates via Nominatim (OpenStreetMap).
 * Free, no API key; rate limit 1 req/sec.
 * Returns null if the address can't be resolved.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, displayName: data[0].display_name };
  } catch {
    return null;
  }
}
