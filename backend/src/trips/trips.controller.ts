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
import { CompleteTripDto } from './dto/complete-trip.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { TripStatus } from '@prisma/client';

@ApiTags('Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Post('accept/:loadId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Force-accept a load (admin override — bypasses postulation flow)',
  })
  acceptLoad(
    @CurrentUser('id') userId: string,
    @Param('loadId') loadId: string,
  ) {
    return this.tripsService.acceptLoad(userId, loadId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all trips (Admin only)' })
  findAll(
    @Query('status') status?: TripStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tripsService.findAll({ status, page, limit });
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'List my trips (Carrier)' })
  findMyTrips(
    @CurrentUser('id') userId: string,
    @Query('status') status?: TripStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tripsService.findAll({ carrierId: userId, status, page, limit });
  }

  @Get('metrics')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({
    summary: 'Fuel + on-time delivery metrics for the current carrier',
  })
  getMyMetrics(@CurrentUser('id') userId: string) {
    return this.tripsService.getCarrierMetrics(userId);
  }

  @Get('my-loads')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'List trips for my loads (Shipper)' })
  findMyLoadTrips(
    @CurrentUser('id') userId: string,
    @Query('status') status?: TripStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tripsService.findAll({ shipperId: userId, status, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trip details (load shipper, assigned carrier or admin)' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.tripsService.findByIdForUser(id, user);
  }

  @Patch(':id/start')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Start a trip (Carrier only)' })
  startTrip(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tripsService.startTrip(id, userId);
  }

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Complete a trip (Carrier only)' })
  completeTrip(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: CompleteTripDto,
  ) {
    return this.tripsService.completeTrip(id, userId, body.fuelLiters);
  }

  @Patch(':id/location')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Update trip location (Carrier only)' })
  updateLocation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() data: UpdateLocationDto,
  ) {
    return this.tripsService.updateLocation(id, userId, data.lat, data.lng);
  }
}
