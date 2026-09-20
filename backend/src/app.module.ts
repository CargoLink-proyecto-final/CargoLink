import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LoadsModule } from './loads/loads.module';
import { LoadsAssistantModule } from './loads-assistant/loads-assistant.module';
import { TripsModule } from './trips/trips.module';
import { PostulationsModule } from './postulations/postulations.module';
import { MessagesModule } from './messages/messages.module';
import { RatingsModule } from './ratings/ratings.module';
import { GeoModule } from './geo/geo.module';
import { CompaniesModule } from './companies/companies.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LoadsModule,
    LoadsAssistantModule,
    TripsModule,
    PostulationsModule,
    MessagesModule,
    RatingsModule,
    CompaniesModule,
    GeoModule,
  ],
})
export class AppModule {}
