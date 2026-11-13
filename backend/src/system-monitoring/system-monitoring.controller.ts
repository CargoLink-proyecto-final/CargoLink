import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SystemMonitoringService } from './system-monitoring.service';
import { MonitoringRangeQueryDto } from './dto/monitoring-range-query.dto';

@ApiTags('SystemMonitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/system')
export class SystemMonitoringController {
  constructor(private monitoringService: SystemMonitoringService) {}

  @Get('health')
  @ApiOperation({ summary: 'Live system health: database, external services, memory, event loop (Admin only)' })
  getHealth() {
    return this.monitoringService.getHealth();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Availability, outages and response times over a range (Admin only)' })
  getMetrics(@Query() query: MonitoringRangeQueryDto) {
    return this.monitoringService.getMetrics(query.range ?? '24h');
  }
}
