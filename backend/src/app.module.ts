import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LoadsModule } from './loads/loads.module';
import { TripsModule } from './trips/trips.module';
import { PostulationsModule } from './postulations/postulations.module';
import { MessagesModule } from './messages/messages.module';
import { RatingsModule } from './ratings/ratings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LoadsModule,
    TripsModule,
    PostulationsModule,
    MessagesModule,
    RatingsModule,
  ],
})
export class AppModule {}
