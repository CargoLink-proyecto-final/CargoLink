import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TransporterReviewService } from './transporter-review.service';
import { ReviewProfileDto } from './dto/review-profile.dto';

// Los archivos se descargan con GET /transporter-profile/documents/:id/file,
// que ya permite al ADMIN.
@ApiTags('TransporterReview')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/transporter-reviews')
export class TransporterReviewController {
  constructor(private transporterReviewService: TransporterReviewService) {}

  @Get()
  @ApiOperation({ summary: 'Transporters with documents pending review (Admin only)' })
  getQueue() {
    return this.transporterReviewService.getQueue();
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Full verification profile of a transporter (Admin only)' })
  getProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.transporterReviewService.getProfile(userId);
  }

  @Post(':userId')
  @ApiOperation({ summary: 'Approve or reject documents of a transporter (Admin only)' })
  review(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReviewProfileDto,
  ) {
    return this.transporterReviewService.review(userId, adminId, dto);
  }
}
