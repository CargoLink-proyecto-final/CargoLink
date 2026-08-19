import { PrismaClient, Prisma } from '@prisma/client';
// `import * as`: el tsconfig del backend no tiene esModuleInterop, así que un
// default import del JSON llega undefined en runtime.
import * as geoData from './data/argentina-geo.json';

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

  return {
    provinces: geo.provinces.length,
    cities: geo.cities.length,
    inserted: missing.length,
    postalCodes,
  };
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
