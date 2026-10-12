import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostulationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProfileApprovedGuard } from '../common/guards/profile-approved.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PostulationsService } from './postulations.service';
import { CreatePostulationDto } from './dto/create-postulation.dto';
import { CounterOfferDto } from './dto/counter-offer.dto';

@ApiTags('Postulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PostulationsController {
  constructor(private postulationsService: PostulationsService) {}

  @Post('loads/:loadId/postulations')
  @UseGuards(RolesGuard, ProfileApprovedGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Postulate to a load (Transporter only, requires an approved profile)' })
  create(
    @Param('loadId') loadId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePostulationDto,
  ) {
    return this.postulationsService.create(loadId, userId, dto);
  }

  @Get('loads/:loadId/postulations')
  @ApiOperation({ summary: 'List postulations for a load (Shipper owner or Admin)' })
  listForLoad(
    @Param('loadId') loadId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.postulationsService.listForLoad(loadId, user.id, user.role);
  }

  @Get('postulations/my')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'List my postulations (Transporter)' })
  listMine(
    @CurrentUser('id') userId: string,
    @Query('status') status?: PostulationStatus,
  ) {
    return this.postulationsService.listMine(userId, status);
  }

  @Post('postulations/:id/accept')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'Accept a postulation and assign the trip (Shipper only)' })
  accept(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postulationsService.accept(id, userId);
  }

  @Post('postulations/:id/counter-offer')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR', 'TRANSPORTER')
  @ApiOperation({ summary: 'Send a counter-offer on a postulation (Shipper or Transporter)' })
  counterOffer(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CounterOfferDto,
  ) {
    return this.postulationsService.counterOffer(id, user.id, user.role, dto);
  }

  @Post('postulations/:id/accept-offer')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: "Accept the shipper's counter-offer (Transporter only)" })
  acceptOffer(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postulationsService.acceptOffer(id, userId);
  }

  @Delete('postulations/:id')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Withdraw my postulation (Transporter)' })
  withdraw(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postulationsService.withdraw(id, userId);
  }
}
