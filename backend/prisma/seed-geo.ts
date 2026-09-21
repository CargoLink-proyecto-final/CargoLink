import { PrismaClient, Prisma } from '@prisma/client';
// `import * as`: el tsconfig del backend no tiene esModuleInterop, así que un
// default import del JSON llega undefined en runtime.
import * as geoData from './data/argentina-geo.json';
import { normalizeSearchText } from '../src/common/text';

interface GeoProvince { code: string; name: string; iso: string | null; country: string }
interface GeoCity {
  code: string;
  name: string;
  provinceCode: string;
  department: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
}

const geo = geoData as unknown as { provinces: GeoProvince[]; cities: GeoCity[] };

// Padrón geográfico oficial (georef — IGN/INDEC vía datos.gob.ar). Es un
// snapshot versionado en el repo: el seed no depende de que la API esté arriba.
// Idempotente — corre en cada arranque del contenedor vía docker-entrypoint.sh.
export async function seedGeo(prisma: PrismaClient) {
  for (const province of geo.provinces) {
    await prisma.province.upsert({
      where: { code: province.code },
      update: { name: province.name, iso: province.iso, country: province.country },
      create: {
        code: province.code, name: province.name, iso: province.iso, country: province.country,
      },
    });
  }

  const provinces = await prisma.province.findMany({ select: { id: true, code: true } });
  const idByCode = new Map(provinces.map((p) => [p.code, p.id]));

  // Se insertan solo las ciudades que faltan: 4.027 upserts individuales
  // costarían varios segundos en cada arranque, un createMany es una query.
  const known = new Set(
    (await prisma.city.findMany({ select: { code: true } })).map((c) => c.code),
  );
  const missing = geo.cities.filter((city) => !known.has(city.code));

  if (missing.length > 0) {
    await prisma.city.createMany({
      data: missing.map((city) => ({
        code: city.code,
        name: city.name,
        searchName: normalizeSearchText(city.name),
        department: city.department,
        postalCode: city.postalCode,
        lat: city.lat,
        lng: city.lng,
        provinceId: idByCode.get(city.provinceCode)!,
      })),
      skipDuplicates: true,
    });
  }

  const postalCodes = await syncPostalCodes(prisma);
  const renamed = await syncCityNames(prisma);

  return {
    provinces: geo.provinces.length,
    cities: geo.cities.length,
    inserted: missing.length,
    postalCodes,
    renamed,
  };
}

/**
 * Reconcilia `name` y `search_name` de las filas ya cargadas contra el padrón.
 * Hay dos motivos para que difieran:
 *
 * - `search_name` es una columna nueva. La migración la backfillea en SQL, pero
 *   acá manda TypeScript: `normalizeSearchText` es la misma función que corre el
 *   front sobre lo que tipea el usuario, así que cualquier divergencia (o un
 *   cambio futuro en la normalización) se corrige sola.
 * - El snapshot del padrón se corrigió. Traía 53 localidades con un soft-hyphen
 *   (U+00AD) incrustado por un mal decode de origen: "Junín" se guardaba como
 *   "Juní" + U+00AD + "n", que se lee igual pero no matchea con nada. Las filas
 *   insertadas antes de esa corrección siguen con el nombre roto, porque el
 *   createMany de arriba solo inserta las que faltan y nunca actualiza.
 *
 * Después de la primera corrida no encuentra nada que hacer y queda en un SELECT.
 */
async function syncCityNames(prisma: PrismaClient) {
  const expectedByCode = new Map(geo.cities.map((city) => [city.code, city.name]));
  const cities = await prisma.city.findMany({
    select: { code: true, name: true, searchName: true },
  });

  const stale = cities.flatMap((city) => {
    // Una ciudad que no está en el padrón se deja como está: el nombre que tenga
    // es el único dato disponible, solo se le recalcula la clave de búsqueda.
    const name = expectedByCode.get(city.code) ?? city.name;
    const searchName = normalizeSearchText(name);
    if (name === city.name && searchName === city.searchName) return [];
    return [{ code: city.code, name, searchName }];
  });
  if (stale.length === 0) return 0;

  const CHUNK = 1000;
  for (let i = 0; i < stale.length; i += CHUNK) {
    const chunk = stale.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((city) => Prisma.sql`(${city.code}, ${city.name}, ${city.searchName})`),
    );
    await prisma.$executeRaw`
      UPDATE cities SET name = source.name, search_name = source.search_name
      FROM (VALUES ${values}) AS source(code, name, search_name)
      WHERE cities.code = source.code
    `;
  }
  return stale.length;
}

/**
 * Completa los CP de las ciudades que ya estaban cargadas antes de que la
 * columna existiera. Un UPDATE ... FROM (VALUES ...) por lote en vez de 4.027
 * updates sueltos; después de la primera corrida no encuentra nada que hacer.
 */
async function syncPostalCodes(prisma: PrismaClient) {
  const pending = await prisma.city.findMany({
    where: { postalCode: null },
    select: { code: true },
  });
  if (pending.length === 0) return 0;

  const pendingCodes = new Set(pending.map((city) => city.code));
  const withPostal = geo.cities.filter(
    (city) => city.postalCode && pendingCodes.has(city.code),
  );
  if (withPostal.length === 0) return 0;

  const CHUNK = 1000;
  for (let i = 0; i < withPostal.length; i += CHUNK) {
    const chunk = withPostal.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((city) => Prisma.sql`(${city.code}, ${city.postalCode})`),
    );
    await prisma.$executeRaw`
      UPDATE cities SET postal_code = source.postal_code
      FROM (VALUES ${values}) AS source(code, postal_code)
      WHERE cities.code = source.code AND cities.postal_code IS NULL
    `;
  }
  return withPostal.length;
}
