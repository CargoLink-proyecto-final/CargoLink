import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePostulationDto {
  @ApiProperty({ example: 'Tengo camión refrigerado disponible para mañana', required: false })
  @IsOptional()
  @IsString({ message: 'El mensaje debe ser texto' })
  @MaxLength(500, { message: 'El mensaje no puede superar los 500 caracteres' })
  message?: string;

  @ApiProperty({ example: 145000, required: false })
  @IsOptional()
  @IsNumber({}, { message: 'El precio propuesto debe ser un número' })
  @IsPositive({ message: 'El precio propuesto debe ser mayor a cero' })
  proposedPrice?: number;
}
