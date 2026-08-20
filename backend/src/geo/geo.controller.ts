import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeoService } from './geo.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Geo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('geo')
export class GeoController {
  constructor(private geoService: GeoService) {}

  @Get('provinces')
  @ApiOperation({ summary: 'List the 24 Argentine provinces (official INDEC registry)' })
  findProvinces() {
    return this.geoService.findProvinces();
  }

  @Get('cities')
  @ApiOperation({
    summary: 'Search cities (census localities), optionally scoped to a province',
  })
  searchCities(
    @Query('provinceId') provinceId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: number,
  ) {
    return this.geoService.searchCities({
      provinceId,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
