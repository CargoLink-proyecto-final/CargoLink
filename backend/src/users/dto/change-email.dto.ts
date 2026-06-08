import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeEmailDto {
  @ApiProperty({ example: 'new@example.com' })
  @IsEmail({}, { message: 'Debe ser un correo válido' })
  email: string;
}
