import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateJoinRequestDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-0000-0000-000000000000' })
  @IsString({ message: 'El id de la empresa debe ser texto' })
  @IsNotEmpty({ message: 'El id de la empresa es obligatorio' })
  companyId: string;
}
