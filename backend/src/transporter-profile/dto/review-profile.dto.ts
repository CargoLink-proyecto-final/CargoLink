import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const REVIEW_VERDICTS = ['APPROVED', 'REJECTED'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export class DocumentDecisionDto {
  @ApiProperty({ example: '6f1c2c8e-3b0a-4d2f-9a51-2f6f0e7c1a11' })
  @IsUUID('4', { message: 'El id del documento no es válido' })
  documentId: string;

  @ApiProperty({ enum: REVIEW_VERDICTS, example: 'REJECTED' })
  @IsIn(REVIEW_VERDICTS, { message: 'La decisión debe ser APPROVED o REJECTED' })
  status: ReviewVerdict;

  // Obligatorio solo al rechazar: el transportista necesita saber qué corregir.
  @ApiProperty({ required: false, example: 'La foto está borrosa, no se lee el número' })
  @ValidateIf((o: DocumentDecisionDto) => o.status === 'REJECTED')
  @IsString({ message: 'El motivo debe ser texto' })
  @IsNotEmpty({ message: 'Indicá el motivo del rechazo' })
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres' })
  reason?: string;
}

// La revisión se envía de una sola vez por transportista (no documento por
// documento) para mandarle un único mail con todo lo que tiene que corregir.
export class ReviewProfileDto {
  @ApiProperty({ type: [DocumentDecisionDto] })
  @IsArray({ message: 'Las decisiones deben ser una lista' })
  @ArrayMinSize(1, { message: 'Indicá al menos una decisión' })
  @ValidateNested({ each: true })
  @Type(() => DocumentDecisionDto)
  decisions: DocumentDecisionDto[];
}
