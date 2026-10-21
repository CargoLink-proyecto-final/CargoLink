import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { TripStatus } from '@prisma/client';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

// Control de acceso de GET /trips/:id por HTTP real (#161). El detalle del viaje
// trae teléfonos de las dos partes y la ubicación del camión: solo lo pueden ver
// el dador de la carga, el transportista asignado y el ADMIN.
//
// El JWT se reemplaza por un guard que toma el usuario de headers, así el test
// no depende de firmar tokens. Prisma va mockeado.

class HeaderUserGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.user = { id: req.headers['x-user-id'], role: req.headers['x-user-role'] };
    return true;
  }
}

describe('GET /trips/:id — control de acceso (integración)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const trip = {
    id: 'trip-1',
    loadId: 'load-1',
    carrierId: 'carrier-1',
    status: TripStatus.IN_PROGRESS,
    currentLat: -31.42,
    currentLng: -64.34,
    load: { id: 'load-1', shipperId: 'shipper-1', shipper: { phone: '+5491100000001' } },
    carrier: { id: 'carrier-1', phone: '+5491100000002' },
    ratings: [],
  };

  beforeAll(async () => {
    const prisma = { trip: { findUnique: jest.fn().mockResolvedValue(trip) } };
    const module = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [TripsService, { provide: PrismaService, useValue: prisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderUserGuard)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  afterAll(async () => {
    await app.close();
  });

  const getTripAs = (id: string, role: string) =>
    fetch(`${baseUrl}/trips/trip-1`, { headers: { 'x-user-id': id, 'x-user-role': role } });

  it.each([
    ['the shipper who owns the load', 'shipper-1', 'CARGO_GENERATOR'],
    ['the assigned carrier', 'carrier-1', 'TRANSPORTER'],
    ['an ADMIN', 'admin-1', 'ADMIN'],
  ])('returns 200 to %s', async (_label, id, role) => {
    // Act
    const res = await getTripAs(id, role);
    // Assert
    expect(res.status).toBe(200);
  });

  it.each([
    ['another carrier', 'carrier-2', 'TRANSPORTER'],
    ['another shipper', 'shipper-2', 'CARGO_GENERATOR'],
  ])('returns 403 to %s, without leaking the trip', async (_label, id, role) => {
    // Act
    const res = await getTripAs(id, role);
    const body = await res.text();
    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toContain('+549110000000');
  });
});
