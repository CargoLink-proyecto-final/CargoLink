import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { MonitoringRange } from '../system-monitoring.service';

export const MONITORING_RANGES: MonitoringRange[] = ['24h', '7d', '30d'];

export class MonitoringRangeQueryDto {
  @ApiPropertyOptional({ enum: MONITORING_RANGES, default: '24h' })
  @IsOptional()
  @IsIn(MONITORING_RANGES, { message: 'El rango debe ser 24h, 7d o 30d' })
  range?: MonitoringRange;
}
