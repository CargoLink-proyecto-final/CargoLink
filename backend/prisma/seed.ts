import { PrismaClient, Role, JoinRequestStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedGeo } from './seed-geo';
import { backfillLoadCities } from './backfill-load-cities';

const prisma = new PrismaClient();

async function main() {
  const geo = await seedGeo(prisma);

  const password = await bcrypt.hash('password123', 10);

  // El ADMIN es la única cuenta con permisos sobre todo el sistema, así que no
  // comparte la password genérica de las cuentas demo: sale de ADMIN_PASSWORD
  // para que cada entorno la inyecte por secret. El fallback es para dev local
  // y para que un entorno nuevo levante usable sin config previa.
  const declaredAdminPassword = process.env.ADMIN_PASSWORD;
  const adminPassword = await bcrypt.hash(
    declaredAdminPassword || 'cladmin2026',
    10,
  );

  const admin = await prisma.user.upsert({
    where: { email: 'admin@cargolink.com' },
    update: {
      emailVerified: true,
      // La password solo se reescribe si el entorno la declaró: ahí
      // ADMIN_PASSWORD es la fuente de verdad y rotarla es cambiar el secret y
      // reiniciar. Sin la variable no se pisa nada, porque el seed corre en
      // cada arranque del contenedor y le borraría al admin una password
      // cambiada por /auth/reset-password.
      ...(declaredAdminPassword ? { password: adminPassword } : {}),
    },
    create: {
      email: 'admin@cargolink.com',
      password: adminPassword,
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

  // ---- Empresa demo (rol COMPANY_ADMIN) ----
  const companyAdmin = await prisma.user.upsert({
    where: { email: 'empresa@example.com' },
    update: { emailVerified: true },
    create: {
      email: 'empresa@example.com',
      password,
      firstName: 'Laura',
      lastName: 'Fernández',
      phone: '+5491155550000',
      role: Role.COMPANY_ADMIN,
      companyName: 'Flota Andina',
      emailVerified: true,
    },
  });

  const company = await prisma.company.upsert({
    where: { ownerId: companyAdmin.id },
    update: {},
    create: { name: 'Flota Andina', ownerId: companyAdmin.id },
  });

  // Dos conductores miembros de la empresa.
  const driverOne = await prisma.user.upsert({
    where: { email: 'driver1@example.com' },
    update: { emailVerified: true, companyId: company.id },
    create: {
      email: 'driver1@example.com',
      password,
      firstName: 'Pedro',
      lastName: 'Gómez',
      phone: '+5491155551111',
      role: Role.TRANSPORTER,
      emailVerified: true,
      companyId: company.id,
    },
  });

  const driverTwo = await prisma.user.upsert({
    where: { email: 'driver2@example.com' },
    update: { emailVerified: true, companyId: company.id },
    create: {
      email: 'driver2@example.com',
      password,
      firstName: 'Sofía',
      lastName: 'Ramírez',
      phone: '+5491155552222',
      role: Role.TRANSPORTER,
      emailVerified: true,
      companyId: company.id,
    },
  });

  // Un conductor con solicitud PENDING (para probar el inbox de aprobación).
  const driverPending = await prisma.user.upsert({
    where: { email: 'driver3@example.com' },
    update: { emailVerified: true },
    create: {
      email: 'driver3@example.com',
      password,
      firstName: 'Diego',
      lastName: 'López',
      phone: '+5491155553333',
      role: Role.TRANSPORTER,
      emailVerified: true,
    },
  });

  const joinRequest = await prisma.companyJoinRequest.upsert({
    where: {
      companyId_transporterId: {
        companyId: company.id,
        transporterId: driverPending.id,
      },
    },
    update: { status: JoinRequestStatus.PENDING, decidedAt: null },
    create: { companyId: company.id, transporterId: driverPending.id },
  });

  // ---- Transportistas demo sueltos (sin empresa) ----
  // Cuentas para las pruebas de la cátedra: una por evaluador, más dos genéricas.
  // Van sin companyId a propósito — así cada una postula por su cuenta y no
  // arrastra la lógica de aprobación de Flota Andina.
  const DEMO_TRANSPORTERS = [
    { email: 'profe1@cargolink.com', firstName: 'Profe', lastName: '1', phone: '+5491155560001' },
    { email: 'profe2@cargolink.com', firstName: 'Profe', lastName: '2', phone: '+5491155560002' },
    { email: 'profe3@cargolink.com', firstName: 'Profe', lastName: '3', phone: '+5491155560003' },
    { email: 'transportista1@cargolink.com', firstName: 'Transportista', lastName: '1', phone: '+5491155560011' },
    { email: 'transportista2@cargolink.com', firstName: 'Transportista', lastName: '2', phone: '+5491155560012' },
  ];

  const demoTransporters: string[] = [];
  for (const demo of DEMO_TRANSPORTERS) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { emailVerified: true },
      create: {
        ...demo,
        password,
        role: Role.TRANSPORTER,
        emailVerified: true,
      },
    });
    demoTransporters.push(user.email);
  }

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
          cargoType: 'Electrónica y tecnología',
          weight: 2500,
          volume: 8.5,
          pickupDate: pickup,
          deliveryDate: delivery,
          price: 250000,
        },
      });

  const backfill = await backfillLoadCities(prisma);

  console.log('Datos de seed listos:', {
    geo: `${geo.provinces} provincias, ${geo.cities} ciudades (${geo.inserted} nuevas, ${geo.postalCodes} CP completados, ${geo.renamed} nombres reconciliados)`,
    admin: `${admin.email} (password: ${declaredAdminPassword ? 'ADMIN_PASSWORD, reescrita' : 'fallback del seed, sin pisar la existente'})`,
    shipper: shipper.email,
    carrier: carrier.email,
    companyAdmin: companyAdmin.email,
    company: company.name,
    members: [driverOne.email, driverTwo.email],
    pendingRequest: `${driverPending.email} -> ${joinRequest.status}`,
    demoTransporters,
    load: load.id,
    reused: !!existing,
    backfill: `${backfill.origin} orígenes / ${backfill.dest} destinos resueltos sobre ${backfill.pending} cargas`,
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
