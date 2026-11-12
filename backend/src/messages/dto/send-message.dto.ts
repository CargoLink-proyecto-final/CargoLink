import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_MESSAGE_LENGTH } from '../message-limits';

/**
 * Antes este endpoint recibía `@Body() data: { content: string }` crudo. El
 * `ValidationPipe` no valida tipos planos, así que el whitelist global no lo
 * alcanzaba: entraba cualquier cosa, incluido un string vacío o de largo
 * arbitrario. Y el contenido viaja al cuerpo de la notificación push, que Expo
 * limita por tamaño de payload.
 */
export class SendMessageDto {
  @ApiProperty({
    description: 'Texto del mensaje.',
    maxLength: MAX_MESSAGE_LENGTH,
    example: 'Estoy llegando al punto de carga.',
  })
  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `El mensaje no puede superar los ${MAX_MESSAGE_LENGTH} caracteres`,
  })
  content: string;
}
