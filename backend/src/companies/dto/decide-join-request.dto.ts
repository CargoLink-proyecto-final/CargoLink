import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DecideJoinRequestDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], example: 'APPROVE' })
  @IsIn(['APPROVE', 'REJECT'], { message: 'La decisión debe ser APPROVE o REJECT' })
  decision: 'APPROVE' | 'REJECT';
}
