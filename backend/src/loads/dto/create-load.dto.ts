import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: 'Electronics' })
  @IsString({ message: 'El tipo de carga debe ser texto' })
  @IsNotEmpty({ message: 'El tipo de carga es obligatorio' })
  cargoType: string;

  @ApiProperty({ example: 5000 })
  @IsNumber({}, { message: 'El peso debe ser un número' })
  weight: number;

  @ApiProperty({ example: 12.5, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El volumen debe ser un número' })
  volume?: number;

  @ApiProperty({ example: '2024-02-15T10:00:00Z' })
  @IsDateString({}, { message: 'La fecha de recogida debe ser una fecha válida' })
  pickupDate: string;

  @ApiProperty({ example: '2024-02-16T18:00:00Z' })
  @IsDateString({}, { message: 'La fecha de entrega debe ser una fecha válida' })
  deliveryDate: string;

  @ApiProperty({ example: 150000 })
  @IsNumber({}, { message: 'El precio debe ser un número' })
  price: number;
}
