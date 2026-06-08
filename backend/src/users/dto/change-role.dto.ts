import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class ChangeRoleDto {
  @ApiProperty({ enum: Role, example: 'TRANSPORTER' })
  @IsEnum(Role, { message: 'El rol debe ser un valor válido' })
  role: Role;
}
