import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Actualización parcial del propio perfil. Todos los campos son opcionales (sólo se
// actualiza lo que viene), pero si vienen NO pueden quedar vacíos: cubre el criterio
// "no se permite dejar vacíos los campos obligatorios".
export class UpdateProfileDto {
  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre no puede quedar vacío' })
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido no puede quedar vacío' })
  lastName?: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono no puede quedar vacío' })
  phone?: string;

  @ApiProperty({ example: 'Acme Logistics', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre de la empresa debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de la empresa no puede quedar vacío' })
  companyName?: string;

  // Rubro o actividad del publicador. Opcional y puede quedar vacío (se permite
  // limpiarlo), a diferencia de los campos obligatorios de arriba.
  @ApiProperty({ example: 'Agroindustria', required: false })
  @IsOptional()
  @IsString({ message: 'El rubro debe ser texto' })
  industry?: string;

  // Zona de influencia del transportista (P12): editable desde el perfil.
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
