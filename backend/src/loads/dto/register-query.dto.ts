import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LoadStatus } from '@prisma/client';

const TERMINAL_STATUSES: LoadStatus[] = ['DELIVERED', 'CANCELLED'];

export class RegisterQueryDto {
  @ApiPropertyOptional({
    example: 'DELIVERED,CANCELLED',
    description: 'Comma-separated. Defaults to DELIVERED + CANCELLED.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.length) return undefined;
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  })
  @IsArray()
  @IsIn(TERMINAL_STATUSES, { each: true })
  statuses?: LoadStatus[];

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Admin only: filter by shipper or carrier name/company.' })
  @IsOptional()
  @IsString()
  participant?: string;

  @ApiPropertyOptional({ description: 'Free-text on title, cargo type, origin/destination address.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
