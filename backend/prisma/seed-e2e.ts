import {
  PrismaClient,
  Role,
  BodyType,
  VehicleUnit,
  DocumentStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { REQUIRED_DOCUMENT_TYPES } from '../src/transporter-profile/profile-completeness';

export const E2E_SHIPPER_EMAIL = 'e2e-shipper@cargolink.test';
export const E2E_CARRIER_EMAIL = 'e2e-carrier@cargolink.test';

// Cuentas del flujo E2E post-deploy (deploy/vps/e2e-trips.mjs). Solo se crean
// si el entorno define E2E_PASSWORD, que va únicamente en el .env de dev:
// el E2E escribe datos (carga, postulación, viaje, calificación) y nunca corre
// contra prod.
//
// El registro normal exige verificar el mail y que el admin apruebe los
// documentos del transportista, así que el E2E no puede crearse las cuentas
// solo. Acá quedan listas: mail verificado, perfil completo, un vehículo que
// cumple los requisitos de la carga del E2E y los documentos obligatorios ya
// aprobados (sin archivo real).
//
// La password se reescribe en cada corrida: E2E_PASSWORD es la fuente de verdad.
export async function seedE2eAccounts(prisma: PrismaClient) {
  const plain = process.env.E2E_PASSWORD;
  if (!plain) return null;

  const password = await bcrypt.hash(plain, 10);

  const shipper = await prisma.user.upsert({
    where: { email: E2E_SHIPPER_EMAIL },
    update: { password, emailVerified: true, isActive: true },
    create: {
      email: E2E_SHIPPER_EMAIL,
      password,
      firstName: 'E2E',
      lastName: 'Dador',
      role: Role.CARGO_GENERATOR,
      companyName: 'E2E Pipeline',
      emailVerified: true,
    },
  });

  const profile = {
    password,
    emailVerified: true,
    isActive: true,
    cuit: '20000000001',
    licenseCategory: 'E1',
    licenseExpiresAt: new Date('2099-12-31'),
    termsAcceptedAt: new Date('2026-01-01'),
    termsAcceptedVersion: 'e2e',
  };
  const carrier = await prisma.user.upsert({
    where: { email: E2E_CARRIER_EMAIL },
    update: profile,
    create: {
      ...profile,
      email: E2E_CARRIER_EMAIL,
      firstName: 'E2E',
      lastName: 'Transportista',
      role: Role.TRANSPORTER,
    },
  });

  await prisma.vehicle.upsert({
    where: { userId: carrier.id },
    update: {},
    create: {
      userId: carrier.id,
      plate: 'E2E000',
      brand: 'E2E',
      model: 'Pipeline',
      year: 2024,
      unit: VehicleUnit.SEMIRREMOLQUE,
      bodyType: BodyType.CERRADA,
      maxWeightKg: 30000,
    },
  });

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    await prisma.document.upsert({
      where: { userId_type: { userId: carrier.id, type } },
      update: { status: DocumentStatus.APPROVED, rejectionReason: null },
      create: {
        userId: carrier.id,
        type,
        fileUrl: `e2e/${type.toLowerCase()}.pdf`,
        status: DocumentStatus.APPROVED,
        reviewedAt: new Date(),
      },
    });
  }

  return { shipper: shipper.email, carrier: carrier.email };
}
