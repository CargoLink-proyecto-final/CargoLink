import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptTermsDto {
  // Versión del texto de términos/declaración jurada que se está aceptando —
  // se guarda junto al timestamp para poder demostrar qué aceptó cada usuario
  // si el texto cambia más adelante.
  @ApiProperty({ example: '2026-09-01' })
  @IsString({ message: 'La versión debe ser texto' })
  @IsNotEmpty({ message: 'La versión es obligatoria' })
  version: string;
}
