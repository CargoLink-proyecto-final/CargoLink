import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLocationDto {
  @ApiProperty({ description: 'Latitud actual del transportista.', example: -31.4223 })
  @IsNumber()
  @IsLatitude()
  lat: number;

  @ApiProperty({ description: 'Longitud actual del transportista.', example: -64.34 })
  @IsNumber()
  @IsLongitude()
  lng: number;
}
