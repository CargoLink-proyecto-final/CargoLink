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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PostulationsService } from './postulations.service';
import { CreatePostulationDto } from './dto/create-postulation.dto';

@ApiTags('Postulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PostulationsController {
  constructor(private postulationsService: PostulationsService) {}

  @Post('loads/:loadId/postulations')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Postulate to a load (Transporter only)' })
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

  @Delete('postulations/:id')
  @UseGuards(RolesGuard)
  @Roles('TRANSPORTER')
  @ApiOperation({ summary: 'Withdraw my postulation (Transporter)' })
  withdraw(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postulationsService.withdraw(id, userId);
  }
}
