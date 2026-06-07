import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Ratings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ratings')
export class RatingsController {
  constructor(private ratingsService: RatingsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'Rate the transporter of a completed trip (Shipper only)' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateRatingDto) {
    return this.ratingsService.create(userId, dto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get ratings for a user' })
  getUserRatings(@Param('userId') userId: string) {
    return this.ratingsService.getUserRatings(userId);
  }
}
