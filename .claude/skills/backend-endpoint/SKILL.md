---
name: backend-endpoint
description: Crear, modificar o testear endpoints del backend NestJS de este repo. Usar cuando la tarea toca archivos bajo backend/src/ (controllers, services, modules, DTOs con class-validator), rutas HTTP, dependency injection, acceso a DB con Prisma (PrismaService), autenticación JWT con guards, autorización por rol (CARGO_GENERATOR/TRANSPORTER/ADMIN), decoradores de Swagger, o tests con Jest.
---

# Skill: Backend endpoint

Guía para trabajar en el backend de CargoLink. Stack: **NestJS 10 + Prisma 5 + PostgreSQL 15 + Passport JWT + class-validator + Socket.IO + Swagger**. TypeScript strict.

CargoLink es una plataforma de transporte de carga por carretera: conecta **dadores de carga** (shippers, rol `CARGO_GENERATOR`) con **transportistas** (carriers, rol `TRANSPORTER`), más rol `ADMIN`. Dominio detallado en la skill draft `logistica` (cuando se promueva).

## Arquitectura — un módulo NestJS por dominio

A diferencia de un monolito de un solo archivo, el backend está **modularizado por dominio**. Cada dominio es un módulo NestJS estándar: `*.module.ts` + `*.controller.ts` + `*.service.ts` + `dto/*.dto.ts`.

### Archivos clave

```
backend/src/
├── main.ts                  Bootstrap: CORS, ValidationPipe global, GlobalExceptionFilter, prefix /api, Swagger en /api/docs.
├── app.module.ts            Módulo raíz: importa todos los dominios.
├── auth/                     login, register, JWT, password reset, email verify. jwt.strategy.ts + dto/.
├── users/                    /users (perfil, gestión admin).
├── loads/                    /loads + register de cerrados + export ZIP (archiver). dto/.
├── postulations/             flujo de bidding carrier↔shipper con negociación de precio. dto/.
├── trips/                    viajes + tracking GPS (location updates).
├── messages/                 REST + Socket.IO gateway (namespace /chat).
├── ratings/                  calificaciones post-trip. dto/.
├── mail/                     wrapper Nodemailer (SMTP real o fallback Ethereal).
├── prisma/                   PrismaService (singleton global) + prisma.module.ts.
└── common/                   piezas transversales:
    ├── decorators/           current-user.decorator.ts, roles.decorator.ts.
    ├── guards/               jwt-auth.guard.ts, roles.guard.ts.
    └── filters/              http-exception.filter.ts (GlobalExceptionFilter).
```

**Prefix global `/api`** — un `@Controller('loads')` responde realmente en `/api/loads`.

## Anatomía de un endpoint

### Controller

```ts
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { LoadsService } from './loads.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Loads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)          // todos los métodos requieren JWT
@Controller('loads')
export class LoadsController {
  constructor(private loadsService: LoadsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')       // solo dadores de carga
  @ApiOperation({ summary: 'Create a new load (Shipper only)' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateLoadDto) {
    return this.loadsService.create(userId, dto);
  }
}
```

Reglas:
- El controller **no tiene lógica de negocio** — delega al service inyectado por DI.
- `@ApiTags` + `@ApiBearerAuth` + `@ApiOperation` en endpoints públicos (alimenta `/api/docs`, generado, no se edita a mano).
- Body siempre via DTO (`@Body() dto: XDto`). Nunca parsear `req.body` a mano.
- El user autenticado se lee con `@CurrentUser()` (objeto completo `{ id, email, role }`) o `@CurrentUser('id')` (solo el id).
- Methods sync que devuelven la `Promise` del service — no hace falta `await` si solo retornás.

### Service + Prisma

La lógica vive en el service. La DB se accede inyectando `PrismaService`:

```ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoadStatus } from '@prisma/client';

@Injectable()
export class LoadsService {
  constructor(private prisma: PrismaService) {}

  async create(shipperId: string, dto: CreateLoadDto) {
    return this.prisma.load.create({
      data: {
        ...dto,
        pickupDate: new Date(dto.pickupDate),
        shipperId,
      },
      include: {
        shipper: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      },
    });
  }

  async findOneForUser(id: string, user: { id: string; role: string }) {
    const load = await this.prisma.load.findUnique({ where: { id } });
    if (!load) throw new NotFoundException('Carga no encontrada');
    // Autorización: el shipper solo ve las propias (admin ve todo).
    if (user.role === 'CARGO_GENERATOR' && load.shipperId !== user.id) {
      throw new ForbiddenException('Sin acceso a esta carga');
    }
    return load;
  }
}
```

Notas Prisma:
- IDs son `String` UUID (`@default(uuid())`). No hay ints autoincrementales.
- Columnas DB en snake_case (`@map`), pero en TS se accede en camelCase — la conversión la hace Prisma.
- Enums de Prisma se importan de `@prisma/client` (`LoadStatus`, `TripStatus`, `PostulationStatus`, `Role`). Usá los valores del enum, no strings sueltos, cuando puedas.
- Para incluir relaciones usá `include`/`select`; para no devolver el `password` del User, seleccioná campos explícitos.
- Cross-domain: si un endpoint cruza dominios (ej. aceptar una postulation crea un Trip y pasa el Load a `ASSIGNED`), el service inyecta el service del otro dominio vía DI — no dupliques queries.

### DTO + class-validator

DTOs en `dto/*.dto.ts`. Validados automáticamente por el `ValidationPipe` global (`whitelist + forbidNonWhitelisted + transform`): campos extra fallan con 400, los tipos se transforman.

```ts
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLoadDto {
  @ApiProperty({ example: 'Electronics shipment to Buenos Aires' })
  @IsString({ message: 'El título debe ser texto' })
  @IsNotEmpty({ message: 'El título es obligatorio' })
  title: string;

  @ApiProperty({ example: 12.5, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El volumen debe ser un número' })
  volume?: number;
}
```

Reglas:
- Cada campo lleva su validador (`@IsString`, `@IsNumber`, `@IsDateString`, `@IsOptional`, `@Min`, `@Max`, `@IsEmail`, etc.) + `@ApiProperty` para Swagger.
- **Mensajes de error en español** (`{ message: '...' }`) — son los que ve el usuario.
- Patrón de naming: `CreateXDto` (POST), `UpdateXDto` (PATCH, campos opcionales). DTOs de query como `XQueryDto`.
- Las fechas llegan como `string` ISO (`@IsDateString`) y el service las convierte con `new Date(...)`.

## Autenticación y autorización

Auth en `backend/src/auth/` y `backend/src/common/`. JWT (Passport), payload `{ sub: userId, email, role }`. `JwtStrategy.validate()` puebla `request.user` con `{ id, email, role }`.

### Proteger un endpoint

```ts
@ApiTags('Foo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)                 // a nivel clase: todos requieren JWT
@Controller('foo')
export class FooController {
  @Get()
  @UseGuards(RolesGuard)                 // chequeo de rol
  @Roles('ADMIN', 'CARGO_GENERATOR')     // OR de roles
  list(@CurrentUser('id') userId: string) { ... }
}
```

- **Orden importa**: `JwtAuthGuard` antes que `RolesGuard` — el segundo lee `request.user` que pone el primero.
- `@Roles('CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN')` — sin `@Roles` el `RolesGuard` deja pasar.
- `AuthController` es el único que **no** usa `JwtAuthGuard` (register/login/verify/reset son públicos).
- Autorización de **ownership** (que el recurso pertenezca al usuario) se hace en el service, no en el guard: ej. un shipper solo accede a sus loads, un carrier solo a sus trips.
- Passwords se hashean con bcrypt en `auth.service.ts`. Nunca devolver el campo `password`.

## Errores

Lanzá excepciones semánticas de Nest — el `GlobalExceptionFilter` uniforma el formato (`{ statusCode, message, timestamp }`):

```ts
throw new NotFoundException('Carga no encontrada');
throw new ForbiddenException('Sin acceso a esta carga');
throw new BadRequestException('La fecha de entrega debe ser posterior a la de recogida');
throw new ConflictException('Ya existe una postulación para esta carga');
```

Mensajes en **español**. Códigos comunes: 400 (`BadRequestException`), 401 (sin JWT / token inválido, lo tira el guard), 403 (`ForbiddenException`), 404 (`NotFoundException`), 409 (`ConflictException`). 400 de validación de DTO lo tira el `ValidationPipe` automáticamente.

## Swagger

Generado en `/api/docs`. Cubrí endpoints con `@ApiTags`, `@ApiBearerAuth` (para que aparezca el candado y se pueda probar con Authorize), `@ApiOperation({ summary })`, y `@ApiProperty` en los campos del DTO.

## Testing (Jest)

Hay infra de Jest configurada (`testRegex: '.*\\.spec\\.ts$'`, root `src/`, `ts-jest`) pero **hoy no hay archivos `*.spec.ts`**. Cuando agregues, van junto al archivo que testean (`loads.service.spec.ts`).

Patrón típico: testear el service mockeando `PrismaService`.

```ts
const prismaMock = { load: { create: jest.fn(), findUnique: jest.fn() } };

const moduleRef = await Test.createTestingModule({
  providers: [
    LoadsService,
    { provide: PrismaService, useValue: prismaMock },
  ],
}).compile();
```

Comandos:
```bash
cd backend && npm test          # jest una vez
cd backend && npm run test:watch
cd backend && npm run test:cov  # coverage
```

Probar a mano:
```bash
cd backend && npm run start:dev          # watch, levanta en :3001
# Swagger: http://localhost:3001/api/docs
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'
```

## Checklist al cerrar un cambio de backend

- [ ] El endpoint vive en el módulo de dominio correcto (controller delega al service).
- [ ] Body validado con un DTO + decoradores `class-validator` y mensajes en español.
- [ ] DB accedida vía `PrismaService` inyectado (no instanciar `PrismaClient` a mano).
- [ ] `@UseGuards(JwtAuthGuard)` en endpoints no públicos; `RolesGuard` + `@Roles(...)` donde aplica restricción de rol.
- [ ] Ownership chequeado en el service (shipper/carrier solo ven lo suyo; admin override donde corresponda).
- [ ] Errores con excepciones de Nest (`NotFoundException`, `ForbiddenException`, ...) + mensaje en español.
- [ ] Nunca devolver `password` ni tokens; no loguear secretos.
- [ ] Swagger: `@ApiTags` / `@ApiBearerAuth` / `@ApiOperation` / `@ApiProperty`.
- [ ] `cd backend && npm run lint` limpio.
- [ ] Si tocaste `prisma/schema.prisma`: migración correspondiente (ver skill `db-migration`) y `npx prisma generate`.
- [ ] Probado con curl o desde el frontend / Swagger.
