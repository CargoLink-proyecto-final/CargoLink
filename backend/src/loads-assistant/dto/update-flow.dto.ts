import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { StepType } from '../flow-config';

const STEP_TYPES: StepType[] = ['text', 'number', 'enum', 'address', 'date'];

export class FlowStepDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  field: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  label: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  question: string;

  @ApiProperty()
  @IsBoolean()
  required: boolean;

  @ApiProperty({ enum: STEP_TYPES })
  @IsIn(STEP_TYPES)
  type: StepType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  help?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class UpdateFlowDto {
  @ApiProperty()
  @IsInt()
  version: number;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  systemPreamble: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  greeting: string;

  @ApiProperty({ type: [FlowStepDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FlowStepDto)
  steps: FlowStepDto[];
}
