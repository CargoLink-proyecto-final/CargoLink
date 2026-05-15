import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Debe ser un correo válido' })
  email: string;
}
