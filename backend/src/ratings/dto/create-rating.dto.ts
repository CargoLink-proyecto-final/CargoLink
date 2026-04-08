import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRatingDto {
  @ApiProperty({ example: 'trip-uuid-here' })
  @IsString({ message: 'El ID del viaje debe ser texto' })
  @IsNotEmpty({ message: 'El ID del viaje es obligatorio' })
  tripId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt({ message: 'La puntuación debe ser un número entero' })
  @Min(1, { message: 'La puntuación mínima es 1' })
  @Max(5, { message: 'La puntuación máxima es 5' })
  score: number;

  @ApiProperty({ example: 'Excellent service, on time delivery!', required: false })
  @IsOptional()
  @IsString({ message: 'El comentario debe ser texto' })
  comment?: string;
}
