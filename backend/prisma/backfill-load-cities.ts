import { PrismaClient } from '@prisma/client';

// Normaliza para comparar: sin acentos, sin mayúsculas, sin espacios de más.
// El texto de las direcciones viene de Nominatim y del tipeo del usuario, así
// que "Cordoba" y "Córdoba" tienen que colapsar al mismo valor.
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

type CityRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  province: { name: string };
};

/**
 * Resuelve la ciudad de una dirección libre.
 *
 * 1. Parte la dirección por comas y busca segmentos que sean exactamente el
 *    nombre de una ciudad del padrón — es mucho más preciso que un `contains`,
 *    que haría matchear "Pilar" dentro de "Capilla del Monte".
 * 2. Si hay homónimos (hay tres "Pilar" en el país), desempata por la provincia
 *    nombrada en la dirección y, si no aparece, por cercanía a las coordenadas
 *    de la carga.
 * 3. Sin match textual, cae a la ciudad más cercana dentro de MAX_FALLBACK_KM.
 */
const MAX_FALLBACK_KM = 25;

export function resolveCity(
  address: string,
  coords: { lat: number; lng: number },
  citiesByName: Map<string, CityRow[]>,
  allCities: CityRow[],
): CityRow | null {
  const segments = address.split(',').map((segment) => normalize(segment));

  const candidates = segments.flatMap((segment) => citiesByName.get(segment) ?? []);

  if (candidates.length === 1) return candidates[0];

  if (candidates.length > 1) {
    const byProvince = candidates.filter((city) =>
      segments.includes(normalize(city.province.name)),
    );
    const pool = byProvince.length > 0 ? byProvince : candidates;
    return pool.reduce((closest, city) =>
      distanceKm(coords, city) < distanceKm(coords, closest) ? city : closest,
    );
  }

  const nearest = allCities.reduce((closest, city) =>
    distanceKm(coords, city) < distanceKm(coords, closest) ? city : closest,
  );
  return distanceKm(coords, nearest) <= MAX_FALLBACK_KM ? nearest : null;
}

/**
 * Completa origin/destCityId en las cargas que todavía no lo tienen. Es
 * idempotente: solo mira las filas en null, así que correrlo de nuevo no pisa
 * lo que el usuario eligió en el alta.
 */
export async function backfillLoadCities(prisma: PrismaClient) {
  const pending = await prisma.load.findMany({
    where: { OR: [{ originCityId: null }, { destCityId: null }] },
    select: {
      id: true,
      originAddress: true, originLat: true, originLng: true, originCityId: true,
      destAddress: true, destLat: true, destLng: true, destCityId: true,
    },
  });

  if (pending.length === 0) return { pending: 0, origin: 0, dest: 0 };

  const cities = await prisma.city.findMany({
    select: { id: true, name: true, lat: true, lng: true, province: { select: { name: true } } },
  });

  const citiesByName = new Map<string, CityRow[]>();
  for (const city of cities) {
    const key = normalize(city.name);
    const bucket = citiesByName.get(key);
    if (bucket) bucket.push(city);
    else citiesByName.set(key, [city]);
  }

  let origin = 0;
  let dest = 0;

  for (const load of pending) {
    const data: { originCityId?: string; destCityId?: string } = {};

    if (!load.originCityId) {
      const city = resolveCity(
        load.originAddress, { lat: load.originLat, lng: load.originLng }, citiesByName, cities,
      );
      if (city) { data.originCityId = city.id; origin += 1; }
    }
    if (!load.destCityId) {
      const city = resolveCity(
        load.destAddress, { lat: load.destLat, lng: load.destLng }, citiesByName, cities,
      );
      if (city) { data.destCityId = city.id; dest += 1; }
    }

    if (Object.keys(data).length > 0) {
      await prisma.load.update({ where: { id: load.id }, data });
    }
  }

  return { pending: pending.length, origin, dest };
}
