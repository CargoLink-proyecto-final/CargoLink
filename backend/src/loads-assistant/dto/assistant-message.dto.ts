import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LoadDraft } from '../types';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'Quiero mandar electrónica de Córdoba a Rosario' })
  @IsString()
  @MaxLength(4000)
  content: string;
}

export class AssistantMessageDto {
  @ApiProperty({ type: [ChatMessageDto], description: 'Historial de la conversación en orden' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiPropertyOptional({
    description: 'Borrador acumulado hasta ahora (stateless: lo mantiene el frontend)',
  })
  @IsOptional()
  draft?: LoadDraft;
}
