import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password-policy';

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token-here' })
  @IsString({ message: 'El token debe ser texto' })
  @IsNotEmpty({ message: 'El token es obligatorio' })
  token: string;

  @ApiProperty({ example: 'NewStrongPass123', minLength: PASSWORD_MIN_LENGTH })
  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `La nueva contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres`,
  })
  newPassword: string;
}
