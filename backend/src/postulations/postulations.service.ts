import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LoadStatus,
  PostulationStatus,
  TripStatus,
  Prisma,
} from '@prisma/client';
import { CreatePostulationDto } from './dto/create-postulation.dto';

const TRANSPORTER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  companyName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class PostulationsService {
  constructor(private prisma: PrismaService) {}

  async create(loadId: string, transporterId: string, dto: CreatePostulationDto) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } });
    if (!load) throw new NotFoundException('Carga no encontrada');
    if (load.status !== LoadStatus.PUBLISHED) {
      throw new BadRequestException('La carga ya no está disponible para postulación');
    }
    if (load.shipperId === transporterId) {
      throw new ForbiddenException('No podés postularte a tu propia carga');
    }

    const existing = await this.prisma.postulation.findUnique({
      where: { loadId_transporterId: { loadId, transporterId } },
    });

    if (existing) {
      if (existing.status === PostulationStatus.WITHDRAWN) {
        return this.prisma.postulation.update({
          where: { id: existing.id },
          data: {
            status: PostulationStatus.PENDING,
            message: dto.message ?? null,
            proposedPrice: dto.proposedPrice ?? null,
          },
        });
      }
      throw new ConflictException('Ya te postulaste a esta carga');
    }

    return this.prisma.postulation.create({
      data: {
        loadId,
        transporterId,
        message: dto.message,
        proposedPrice: dto.proposedPrice,
      },
    });
  }

  async listForLoad(loadId: string, userId: string, userRole: string) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } });
    if (!load) throw new NotFoundException('Carga no encontrada');
    if (userRole !== 'ADMIN' && load.shipperId !== userId) {
      throw new ForbiddenException('No podés ver postulaciones de esta carga');
    }

    const postulations = await this.prisma.postulation.findMany({
      where: { loadId },
      include: { transporter: { select: TRANSPORTER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });

    if (postulations.length === 0) return [];

    const transporterIds = postulations.map((p) => p.transporterId);
    const ratingAgg = await this.prisma.rating.groupBy({
      by: ['toUserId'],
      where: { toUserId: { in: transporterIds } },
      _avg: { score: true },
      _count: { _all: true },
    });

    const ratingByUser = new Map(
      ratingAgg.map((r) => [
        r.toUserId,
        {
          averageRating: r._avg.score != null ? Math.round(r._avg.score * 10) / 10 : 0,
          totalRatings: r._count._all,
        },
      ]),
    );

    const enriched = postulations.map((p) => ({
      ...p,
      averageRating: ratingByUser.get(p.transporterId)?.averageRating ?? 0,
      totalRatings: ratingByUser.get(p.transporterId)?.totalRatings ?? 0,
    }));

    return enriched.sort((a, b) => {
      if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  async listMine(transporterId: string, status?: PostulationStatus) {
    const where: Prisma.PostulationWhereInput = { transporterId };
    if (status) where.status = status;

    return this.prisma.postulation.findMany({
      where,
      include: {
        load: {
          select: {
            id: true,
            title: true,
            status: true,
            originAddress: true,
            destAddress: true,
            pickupDate: true,
            price: true,
            shipper: {
              select: { id: true, firstName: true, lastName: true, companyName: true },
            },
            trip: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accept(postulationId: string, userId: string) {
    const postulation = await this.prisma.postulation.findUnique({
      where: { id: postulationId },
      include: { load: true },
    });
    if (!postulation) throw new NotFoundException('Postulación no encontrada');
    if (postulation.load.shipperId !== userId) {
      throw new ForbiddenException('No sos el dueño de esta carga');
    }
    if (postulation.status !== PostulationStatus.PENDING) {
      throw new BadRequestException('La postulación no está pendiente');
    }
    if (postulation.load.status !== LoadStatus.PUBLISHED) {
      throw new BadRequestException('La carga ya no está disponible');
    }

    return this.prisma.$transaction(async (tx) => {
      const accepted = await tx.postulation.update({
        where: { id: postulationId },
        data: { status: PostulationStatus.ACCEPTED },
      });

      await tx.postulation.updateMany({
        where: {
          loadId: postulation.loadId,
          id: { not: postulationId },
          status: PostulationStatus.PENDING,
        },
        data: { status: PostulationStatus.REJECTED },
      });

      await tx.load.update({
        where: { id: postulation.loadId },
        data: { status: LoadStatus.ASSIGNED },
      });

      const trip = await tx.trip.create({
        data: {
          loadId: postulation.loadId,
          carrierId: postulation.transporterId,
          status: TripStatus.ACCEPTED,
        },
        include: {
          load: true,
          carrier: { select: TRANSPORTER_SELECT },
        },
      });

      return { postulation: accepted, trip };
    });
  }

  async withdraw(postulationId: string, transporterId: string) {
    const postulation = await this.prisma.postulation.findUnique({
      where: { id: postulationId },
      include: { load: true },
    });
    if (!postulation) throw new NotFoundException('Postulación no encontrada');
    if (postulation.transporterId !== transporterId) {
      throw new ForbiddenException('No es tu postulación');
    }
    if (postulation.status !== PostulationStatus.PENDING) {
      throw new BadRequestException('Sólo podés retirar postulaciones pendientes');
    }
    if (postulation.load.status !== LoadStatus.PUBLISHED) {
      throw new BadRequestException('La carga ya no está disponible');
    }

    return this.prisma.postulation.update({
      where: { id: postulationId },
      data: { status: PostulationStatus.WITHDRAWN },
    });
  }
}
