import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@cargolink.com' },
    update: { emailVerified: true },
    create: {
      email: 'admin@cargolink.com',
      password,
      firstName: 'Admin',
      lastName: 'CargoLink',
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  const shipper = await prisma.user.upsert({
    where: { email: 'shipper@example.com' },
    update: { emailVerified: true },
    create: {
      email: 'shipper@example.com',
      password,
      firstName: 'Juan',
      lastName: 'García',
      phone: '+5491155551234',
      role: Role.CARGO_GENERATOR,
      companyName: 'Logística Sur S.A.',
      emailVerified: true,
    },
  });

  const carrier = await prisma.user.upsert({
    where: { email: 'carrier@example.com' },
    update: { emailVerified: true },
    create: {
      email: 'carrier@example.com',
      password,
      firstName: 'Carlos',
      lastName: 'Martínez',
      phone: '+5491155555678',
      role: Role.TRANSPORTER,
      companyName: 'Transporte Rápido',
      emailVerified: true,
    },
  });

  const SEED_LOAD_TITLE = 'Electrónica a Córdoba';
  const existing = await prisma.load.findFirst({
    where: { shipperId: shipper.id, title: SEED_LOAD_TITLE },
  });

  const now = new Date();
  const pickup = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const delivery = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const load = existing
    ? existing
    : await prisma.load.create({
        data: {
          shipperId: shipper.id,
          title: SEED_LOAD_TITLE,
          description: 'Carga frágil de componentes electrónicos',
          originAddress: 'Av. Corrientes 1234, CABA',
          originLat: -34.6037,
          originLng: -58.3816,
          destAddress: 'Av. Colón 567, Córdoba',
          destLat: -31.4201,
          destLng: -64.1888,
          cargoType: 'Electrónica',
          weight: 2500,
          volume: 8.5,
          pickupDate: pickup,
          deliveryDate: delivery,
          price: 250000,
        },
      });

  console.log('Datos de seed listos:', {
    admin: admin.email,
    shipper: shipper.email,
    carrier: carrier.email,
    load: load.id,
    reused: !!existing,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
