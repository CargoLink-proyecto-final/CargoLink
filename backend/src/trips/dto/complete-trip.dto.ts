import { IsNumber, IsOptional, IsPositive, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteTripDto {
  @ApiPropertyOptional({
    description: 'Litros de combustible usados en el viaje (los carga el transportista al completar).',
    example: 85.5,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(100000)
  fuelLiters?: number;
}
