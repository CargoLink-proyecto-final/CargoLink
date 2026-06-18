import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

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

  @ApiProperty({ enum: Role, example: 'CARGO_GENERATOR' })
  @IsEnum(Role, { message: 'El rol debe ser un valor válido' })
  role: Role;

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
}
