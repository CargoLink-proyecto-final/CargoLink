import { PrismaClient, LoadStatus, TripStatus } from '@prisma/client';

// Fixture de la prueba de carga (tests/k6/trips-location.js): deja un viaje
// IN_PROGRESS del transportista demo y escribe su id por stdout.
//
// Va directo a la DB porque por API el transportista necesita el perfil
// completo y aprobado (documentos, CUIT, licencia) para postularse, y eso no
// es lo que mide la prueba. Requiere el seed corrido (usa las cuentas demo).
//
//   npx ts-node prisma/k6-fixture.ts        (dev)
//   node dist/prisma/k6-fixture.js          (imagen buildeada / CI)

const prisma = new PrismaClient();

async function main() {
  const shipperEmail = process.env.K6_SHIPPER_EMAIL ?? 'shipper@example.com';
  const carrierEmail = process.env.K6_CARRIER_EMAIL ?? 'carrier@example.com';

  const [shipper, carrier] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: shipperEmail } }),
    prisma.user.findUniqueOrThrow({ where: { email: carrierEmail } }),
  ]);

  const now = Date.now();
  const trip = await prisma.$transaction(async (tx) => {
    const load = await tx.load.create({
      data: {
        shipperId: shipper.id,
        title: `k6 tracking ${new Date(now).toISOString()}`,
        originAddress: 'Buenos Aires',
        originLat: -34.6037,
        originLng: -58.3816,
        destAddress: 'Córdoba',
        destLat: -31.4201,
        destLng: -64.1888,
        cargoType: 'Alimentos y bebidas',
        weight: 1000,
        price: 150000,
        pickupDate: new Date(now),
        deliveryDate: new Date(now + 2 * 24 * 3600 * 1000),
        status: LoadStatus.IN_TRANSIT,
      },
    });

    return tx.trip.create({
      data: {
        loadId: load.id,
        carrierId: carrier.id,
        status: TripStatus.IN_PROGRESS,
        startedAt: new Date(now),
      },
    });
  });

  process.stdout.write(trip.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
