import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { DecideJoinRequestDto } from './dto/decide-join-request.dto';
import { JoinRequestStatus, TripStatus } from '@prisma/client';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  // ---- Directorio (cualquier usuario autenticado) ----

  @Get()
  @ApiOperation({ summary: 'List companies directory (for drivers to join)' })
  list() {
    return this.companiesService.listCompanies();
  }

  // ---- Lado admin de empresa (COMPANY_ADMIN, scopeado a su empresa) ----

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'Get my company overview (Company admin)' })
  getMyCompany(@CurrentUser('id') userId: string) {
    return this.companiesService.getMyCompany(userId);
  }

  @Get('me/drivers')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'List my company drivers (Company admin)' })
  listDrivers(@CurrentUser('id') userId: string) {
    return this.companiesService.listDrivers(userId);
  }

  @Get('me/drivers/:driverId/stats')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'Get a driver performance stats (Company admin)' })
  getDriverStats(
    @CurrentUser('id') userId: string,
    @Param('driverId') driverId: string,
  ) {
    return this.companiesService.getDriverStats(userId, driverId);
  }

  @Delete('me/drivers/:driverId')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'Remove a driver from my company (Company admin)' })
  removeDriver(
    @CurrentUser('id') userId: string,
    @Param('driverId') driverId: string,
  ) {
    return this.companiesService.removeDriver(userId, driverId);
  }

  @Get('me/requests')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'List join requests for my company (Company admin)' })
  listRequests(
    @CurrentUser('id') userId: string,
    @Query('status') status?: JoinRequestStatus,
  ) {
    return this.companiesService.listRequests(userId, status);
  }

  @Patch('me/requests/:requestId')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'Approve or reject a join request (Company admin)' })
  decideRequest(
    @CurrentUser('id') userId: string,
    @Param('requestId') requestId: string,
    @Body() dto: DecideJoinRequestDto,
  ) {
    return this.companiesService.decideRequest(userId, requestId, dto.decision);
  }

  @Get('me/trips')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'List trips of my company drivers (Company admin)' })
  listCompanyTrips(
    @CurrentUser('id') userId: string,
    @Query('status') status?: TripStatus,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.companiesService.listCompanyTrips(userId, {
      status,
      driverId,
      from,
      to,
      page,
      limit,
    });
  }

  // ---- Lado transportista ----

  @Get('my-membership')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Get my company membership and requests (Driver)' })
  getMyMembership(@CurrentUser('id') userId: string) {
    return this.companiesService.getMyMembership(userId);
  }

  @Post('join-requests')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Request to join a company (Driver)' })
  createJoinRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateJoinRequestDto,
  ) {
    return this.companiesService.createJoinRequest(userId, dto.companyId);
  }

  @Delete('join-requests/:requestId')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Cancel my pending join request (Driver)' })
  cancelJoinRequest(
    @CurrentUser('id') userId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.companiesService.cancelJoinRequest(userId, requestId);
  }

  @Post('leave')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Leave my current company (Driver)' })
  leaveCompany(@CurrentUser('id') userId: string) {
    return this.companiesService.leaveCompany(userId);
  }
}
