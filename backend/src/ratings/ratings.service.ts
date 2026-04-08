import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { TripStatus } from '@prisma/client';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  async create(fromUserId: string, dto: CreateRatingDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: { load: true },
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.status !== TripStatus.COMPLETED) {
      throw new BadRequestException('Solo se pueden calificar viajes completados');
    }

    const toUserId =
      trip.carrierId === fromUserId ? trip.load.shipperId : trip.carrierId;

    if (toUserId === fromUserId) {
      throw new BadRequestException('No puedes calificarte a ti mismo');
    }

    return this.prisma.rating.create({
      data: {
        tripId: dto.tripId,
        fromUserId,
        toUserId,
        score: dto.score,
        comment: dto.comment,
      },
      include: {
        fromUser: { select: { id: true, firstName: true, lastName: true } },
        toUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async getUserRatings(userId: string) {
    const ratings = await this.prisma.rating.findMany({
      where: { toUserId: userId },
      include: {
        fromUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const avgScore =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
        : 0;

    return { ratings, averageScore: Math.round(avgScore * 10) / 10, totalRatings: ratings.length };
  }
}
