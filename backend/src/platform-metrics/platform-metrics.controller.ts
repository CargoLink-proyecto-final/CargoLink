import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PlatformMetricsService } from './platform-metrics.service';

@ApiTags('PlatformMetrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/metrics')
export class PlatformMetricsController {
  constructor(private platformMetricsService: PlatformMetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Platform-wide usage metrics: marketplace, money, operations, verification, growth (Admin only)' })
  getMetrics() {
    return this.platformMetricsService.getMetrics();
  }
}
