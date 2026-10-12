import { ApiProperty } from '@nestjs/swagger';
import { BodyType, VehicleUnit } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { IsFutureDate } from '../../common/validators/is-future-date.validator';

// Upsert completo del vehículo propio (semántica PUT: reemplaza todo lo que
// se manda). Espeja los campos logísticos de Load (weight/volume/dimensiones)
// a propósito, para poder cruzar capacidad de vehículo contra carga más
// adelante.
export class UpsertVehicleDto {
  @ApiProperty({ example: 'AB123CD' })
  @IsString({ message: 'El dominio debe ser texto' })
  @MinLength(6, { message: 'El dominio no es válido' })
  plate: string;

  @ApiProperty({ example: 'Mercedes-Benz' })
  @IsString({ message: 'La marca debe ser texto' })
  brand: string;

  @ApiProperty({ example: 'Actros' })
  @IsString({ message: 'El modelo debe ser texto' })
  model: string;

  @ApiProperty({ example: 2019 })
  @IsInt({ message: 'El año debe ser un número entero' })
  @Min(1970, { message: 'El año no es válido' })
  @Max(new Date().getFullYear() + 1, { message: 'El año no es válido' })
  year: number;

  @ApiProperty({ enum: VehicleUnit, example: 'CHASIS', description: 'Tamaño de la unidad (informativo)' })
  @IsEnum(VehicleUnit, { message: 'La unidad no es válida' })
  unit: VehicleUnit;

  @ApiProperty({ enum: BodyType, example: 'CERRADA' })
  @IsEnum(BodyType, { message: 'La carrocería no es válida' })
  bodyType: BodyType;

  @ApiProperty({ example: 12000 })
  @IsNumber({}, { message: 'La capacidad de carga debe ser un número' })
  @IsPositive({ message: 'La capacidad de carga debe ser mayor a cero' })
  maxWeightKg: number;

  @ApiProperty({ example: 40, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El volumen debe ser un número' })
  @IsPositive({ message: 'El volumen debe ser mayor a cero' })
  maxVolumeM3?: number;

  @ApiProperty({ example: 250, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'La altura debe ser un número' })
  @IsPositive({ message: 'La altura debe ser mayor a cero' })
  heightCm?: number;

  @ApiProperty({ example: 240, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El ancho debe ser un número' })
  @IsPositive({ message: 'El ancho debe ser mayor a cero' })
  widthCm?: number;

  @ApiProperty({ example: 600, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El largo debe ser un número' })
  @IsPositive({ message: 'El largo debe ser mayor a cero' })
  lengthCm?: number;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Refrigerado debe ser verdadero o falso' })
  refrigerated?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Cargas peligrosas debe ser verdadero o falso' })
  hazardousMaterials?: boolean;


  @ApiProperty({ example: '2027-01-01', required: false })
  @IsOptional()
  @IsDateString({}, { message: 'El vencimiento del seguro debe ser una fecha válida' })
  @IsFutureDate({ message: 'El seguro está vencido — poné la fecha del próximo vencimiento' })
  insuranceExpiresAt?: string;

  @ApiProperty({ example: '2027-01-01', required: false })
  @IsOptional()
  @IsDateString({}, { message: 'El vencimiento de la VTV debe ser una fecha válida' })
  @IsFutureDate({ message: 'La VTV está vencida — poné la fecha del próximo vencimiento' })
  vtvExpiresAt?: string;
}
