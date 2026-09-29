import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PushTokenDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Token de Expo del dispositivo. El formato se valida en el service.',
  })
  @IsString({ message: 'El token debe ser texto' })
  @IsNotEmpty({ message: 'El token no puede estar vacío' })
  token: string;
}
