import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CARGO_TYPES } from '../cargo-types.constant';

export class CreateLoadDto {
  @ApiProperty({ example: 'Electronics shipment to Buenos Aires' })
  @IsString({ message: 'El título debe ser texto' })
  @IsNotEmpty({ message: 'El título es obligatorio' })
  title: string;

  @ApiProperty({ example: 'Fragile electronics, handle with care', required: false })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  description?: string;

  @ApiProperty({ example: 'Av. Corrientes 1234, CABA' })
  @IsString({ message: 'La dirección de origen debe ser texto' })
  @IsNotEmpty({ message: 'La dirección de origen es obligatoria' })
  originAddress: string;

  @ApiProperty({ example: -34.6037 })
  @IsNumber({}, { message: 'La latitud de origen debe ser un número' })
  originLat: number;

  @ApiProperty({ example: -58.3816 })
  @IsNumber({}, { message: 'La longitud de origen debe ser un número' })
  originLng: number;

  @ApiProperty({ example: 'Av. San Martín 567, Córdoba' })
  @IsString({ message: 'La dirección de destino debe ser texto' })
  @IsNotEmpty({ message: 'La dirección de destino es obligatoria' })
  destAddress: string;

  @ApiProperty({ example: -31.4201 })
  @IsNumber({}, { message: 'La latitud de destino debe ser un número' })
  destLat: number;

  @ApiProperty({ example: -64.1888 })
  @IsNumber({}, { message: 'La longitud de destino debe ser un número' })
  destLng: number;

  @ApiProperty({ example: 'Mercadería general', enum: CARGO_TYPES })
  @IsString({ message: 'El tipo de carga debe ser texto' })
  @IsNotEmpty({ message: 'El tipo de carga es obligatorio' })
  @IsIn(CARGO_TYPES, { message: `El tipo de carga debe ser uno de: ${CARGO_TYPES.join(', ')}` })
  cargoType: string;

  @ApiProperty({ example: 5000 })
  @IsNumber({}, { message: 'El peso debe ser un número' })
  weight: number;

  @ApiProperty({ example: 12.5, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El volumen debe ser un número' })
  volume?: number;

  @ApiProperty({ example: 10, required: false, description: 'Cantidad de bultos' })
  @IsOptional()
  @IsInt({ message: 'La cantidad de bultos debe ser un número entero' })
  @Min(1, { message: 'La cantidad de bultos debe ser al menos 1' })
  packageCount?: number;

  @ApiProperty({ example: 120, required: false, description: 'Alto del bulto en cm' })
  @IsOptional()
  @IsNumber({}, { message: 'La altura debe ser un número' })
  @Min(0, { message: 'La altura no puede ser negativa' })
  heightCm?: number;

  @ApiProperty({ example: 80, required: false, description: 'Ancho del bulto en cm' })
  @IsOptional()
  @IsNumber({}, { message: 'El ancho debe ser un número' })
  @Min(0, { message: 'El ancho no puede ser negativo' })
  widthCm?: number;

  @ApiProperty({ example: 100, required: false, description: 'Largo del bulto en cm' })
  @IsOptional()
  @IsNumber({}, { message: 'El largo debe ser un número' })
  @Min(0, { message: 'El largo no puede ser negativo' })
  lengthCm?: number;

  @ApiProperty({ example: '2024-02-15T10:00:00Z' })
  @IsDateString({}, { message: 'La fecha de recogida debe ser una fecha válida' })
  pickupDate: string;

  @ApiProperty({ example: '2024-02-16T18:00:00Z' })
  @IsDateString({}, { message: 'La fecha de entrega debe ser una fecha válida' })
  deliveryDate: string;

  @ApiProperty({
    example: 150000,
    required: false,
    description: 'Opcional. Si no se envía, la carga sale "a convenir" y el precio lo fija la postulación del transportista.',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  price?: number;
}
