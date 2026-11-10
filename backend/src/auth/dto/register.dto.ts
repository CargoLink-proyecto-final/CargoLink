import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

// Roles que alguien puede elegir al crear su propia cuenta. ADMIN queda afuera a
// propósito: con `@IsEnum(Role)` cualquiera se registraba como administrador
// mandando `"role": "ADMIN"` en el body. Los admins se crean por seed o desde el panel.
export const SELF_REGISTRABLE_ROLES = [
  Role.CARGO_GENERATOR,
  Role.TRANSPORTER,
  Role.COMPANY_ADMIN,
] as const;
export type SelfRegistrableRole = (typeof SELF_REGISTRABLE_ROLES)[number];

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Debe ser un correo válido' })
  email: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  // Una cuenta de empresa (COMPANY_ADMIN) no lleva nombre/apellido personales:
  // el nombre visible se deriva del nombre de la empresa en el service.
  @ApiProperty({ example: 'John', required: false })
  @ValidateIf((o) => o.role !== Role.COMPANY_ADMIN)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @ValidateIf((o) => o.role !== Role.COMPANY_ADMIN)
  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  lastName?: string;

  @ApiProperty({ example: '+1234567890' })
  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  phone: string;

  @ApiProperty({ enum: SELF_REGISTRABLE_ROLES, example: 'CARGO_GENERATOR' })
  @IsIn(SELF_REGISTRABLE_ROLES, { message: 'El rol debe ser un valor válido' })
  role: SelfRegistrableRole;

  @ApiProperty({ example: 'Acme Logistics', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre de la empresa debe ser texto' })
  companyName?: string;

  // Rubro o actividad del publicador de carga (opcional) — contexto para los
  // transportistas y base para segmentaciones futuras.
  @ApiProperty({ example: 'Agroindustria', required: false })
  @IsOptional()
  @IsString({ message: 'El rubro debe ser texto' })
  industry?: string;

  // Zona de influencia del transportista (P12): centro + radio del área habitual
  // de trabajo. Se captura en el registro y se usa para priorizar cargas cercanas.
  @ApiProperty({ example: -31.42, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'La latitud de la zona debe ser un número' })
  zoneLat?: number;

  @ApiProperty({ example: -64.18, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'La longitud de la zona debe ser un número' })
  zoneLng?: number;

  @ApiProperty({ example: 50, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El radio de la zona debe ser un número' })
  @Min(0, { message: 'El radio no puede ser negativo' })
  zoneRadiusKm?: number;
}
