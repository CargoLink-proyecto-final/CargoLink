import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
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

    // Por ahora la calificación es unidireccional: solo el dador de carga
    // (shipper) califica al transportista. El sentido inverso queda fuera.
    if (fromUserId !== trip.load.shipperId) {
      throw new ForbiddenException(
        'Solo el dador de carga puede calificar al transportista',
      );
    }

    const toUserId = trip.carrierId;

    if (toUserId === fromUserId) {
      throw new BadRequestException('No puedes calificarte a ti mismo');
    }

    // Una sola calificación por (viaje, autor). Cubierto además por el unique
    // constraint @@unique([tripId, fromUserId]); lo chequeamos antes para
    // devolver un 409 claro en lugar de un error de constraint.
    const existing = await this.prisma.rating.findUnique({
      where: { tripId_fromUserId: { tripId: dto.tripId, fromUserId } },
    });
    if (existing) {
      throw new ConflictException('Ya calificaste este viaje');
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
