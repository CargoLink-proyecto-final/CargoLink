import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType, example: 'DNI_FRONT' })
  @IsEnum(DocumentType, { message: 'El tipo de documento no es válido' })
  type: DocumentType;
}
