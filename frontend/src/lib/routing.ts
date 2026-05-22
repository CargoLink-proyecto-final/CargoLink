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
export interface NominatimAddressDetail {
  country?: string;
  country_code?: string;
  state?: string;
  province?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  suburb?: string;
  postcode?: string;
}

interface RawNominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddressDetail;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
// Nominatim's public API asks for ≤1 req/sec; space out fallback attempts.
const RATE_LIMIT_MS = 1100;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function normLite(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function localityOf(a: NominatimAddressDetail): string {
  return a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.suburb ?? '';
}

// Among candidates, prefer the one whose actual locality matches the typed
// city — OSM often returns a same-street hit in a neighbouring town first
// (e.g. "José Hernández 706" exists in Laguna Larga but the user means Pilar).
function pickBest(results: RawNominatimResult[], city?: string): RawNominatimResult | null {
  if (!results.length) return null;
  const c = normLite(city?.trim() ?? '');
  if (c) {
    const match = results.find((r) => {
      const loc = normLite(localityOf(r.address ?? {}));
      return loc !== '' && (loc.includes(c) || c.includes(loc));
    });
    if (match) return match;
  }
  return results[0];
}

async function fetchNominatim(params: URLSearchParams): Promise<RawNominatimResult[]> {
  try {
    const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) return [];
    const data = (await res.json()) as RawNominatimResult[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Geocodes structured address components via Nominatim (Argentina-only).
 *
 * Uses a layered strategy because OSM coverage of Argentine house numbers is
 * patchy: an exact structured hit is preferred, but when it fails we broaden to
 * free-text and finally to a street-level match (house number dropped) so the
 * user gets the right street/city instead of a "no existe". Across every layer
 * we prefer the candidate whose locality matches the typed city. Returns null
 * only if nothing resolves at all.
 */
export async function geocodeStructured(parts: {
  street?: string;
  city?: string;
  state?: string;
  postalcode?: string;
}): Promise<{ lat: number; lng: number; displayName: string; address: NominatimAddressDetail } | null> {
  const street = parts.street?.trim() ?? '';
  const city = parts.city?.trim() ?? '';
  const state = parts.state?.trim() ?? '';
  // Argentine CPAs (e.g. "C1043AAU") skew the match — keep only the 4-digit core.
  const postalDigits = /\d{4}/.exec(parts.postalcode?.trim() ?? '')?.[0] ?? '';
  // Street name without its trailing house number(s) — handles both the number
  // typed into the street field and a duplicate in the separate number field.
  const streetName = street.replace(/(\s+\d+[A-Za-z]?)+\s*$/, '').trim();

  if (!street && !city && !state && !postalDigits) return null;

  const base = () => {
    // countrycodes=ar keeps Nominatim from matching same-named places abroad.
    const p = new URLSearchParams({ format: 'json', limit: '5', addressdetails: '1', countrycodes: 'ar' });
    if (city) p.set('city', city);
    if (state) p.set('state', state);
    return p;
  };

  // Layer 1 — exact structured search (street incl. number, with postal code).
  const p1 = base();
  if (street) p1.set('street', street);
  if (postalDigits) p1.set('postalcode', postalDigits);
  let results = await fetchNominatim(p1);

  // Layer 2 — free-text query: forgiving of duplicated numbers and patchy data.
  if (!results.length) {
    const q = [street, city, state, postalDigits, 'Argentina'].filter(Boolean).join(', ');
    if (q) {
      await sleep(RATE_LIMIT_MS);
      const p2 = new URLSearchParams({ format: 'json', limit: '5', addressdetails: '1', countrycodes: 'ar', q });
      results = await fetchNominatim(p2);
    }
  }

  // Layer 3 — street-level match: drop the house number to land on the street/city.
  if (!results.length && streetName && streetName !== street) {
    await sleep(RATE_LIMIT_MS);
    const p3 = base();
    p3.set('street', streetName);
    results = await fetchNominatim(p3);
  }

  const best = pickBest(results, city);
  if (!best) return null;
  const lat = parseFloat(best.lat);
  const lng = parseFloat(best.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng, displayName: best.display_name, address: best.address ?? {} };
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
