import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TripStatus } from '@prisma/client';

@ApiTags('Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Post('accept/:loadId')
  @UseGuards(RolesGuard)
  @Roles('CARRIER')
  @ApiOperation({ summary: 'Accept a load and create a trip (Carrier only)' })
  acceptLoad(
    @CurrentUser('id') userId: string,
    @Param('loadId') loadId: string,
  ) {
    return this.tripsService.acceptLoad(userId, loadId);
  }

  @Get()
  @ApiOperation({ summary: 'List trips with filters' })
  findAll(
    @Query('status') status?: TripStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tripsService.findAll({ status, page, limit });
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('CARRIER')
  @ApiOperation({ summary: 'List my trips (Carrier)' })
  findMyTrips(
    @CurrentUser('id') userId: string,
    @Query('status') status?: TripStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tripsService.findAll({ carrierId: userId, status, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trip details' })
  findOne(@Param('id') id: string) {
    return this.tripsService.findById(id);
  }

  @Patch(':id/start')
  @UseGuards(RolesGuard)
  @Roles('CARRIER')
  @ApiOperation({ summary: 'Start a trip (Carrier only)' })
  startTrip(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tripsService.startTrip(id, userId);
  }

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles('CARRIER')
  @ApiOperation({ summary: 'Complete a trip (Carrier only)' })
  completeTrip(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tripsService.completeTrip(id, userId);
  }

  @Patch(':id/location')
  @UseGuards(RolesGuard)
  @Roles('CARRIER')
  @ApiOperation({ summary: 'Update trip location (Carrier only)' })
  updateLocation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() data: { lat: number; lng: number },
  ) {
    return this.tripsService.updateLocation(id, userId, data.lat, data.lng);
  }
}
