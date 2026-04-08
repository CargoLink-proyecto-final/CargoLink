import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
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

  @ApiProperty({ example: 'John' })
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  lastName: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  phone?: string;

  @ApiProperty({ enum: Role, example: 'SHIPPER' })
  @IsEnum(Role, { message: 'El rol debe ser un valor válido' })
  role: Role;

  @ApiProperty({ example: 'Acme Logistics', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre de la empresa debe ser texto' })
  companyName?: string;
}
