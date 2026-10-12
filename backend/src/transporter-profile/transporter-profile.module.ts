import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { TransporterProfileController } from './transporter-profile.controller';
import { TransporterProfileService } from './transporter-profile.service';
import { TransporterReviewController } from './transporter-review.controller';
import { TransporterReviewService } from './transporter-review.service';

@Module({
  imports: [MailModule],
  controllers: [TransporterProfileController, TransporterReviewController],
  providers: [TransporterProfileService, TransporterReviewService],
})
export class TransporterProfileModule {}
