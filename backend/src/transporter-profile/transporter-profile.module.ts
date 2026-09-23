import { Module } from '@nestjs/common';
import { TransporterProfileController } from './transporter-profile.controller';
import { TransporterProfileService } from './transporter-profile.service';

@Module({
  controllers: [TransporterProfileController],
  providers: [TransporterProfileService],
})
export class TransporterProfileModule {}
