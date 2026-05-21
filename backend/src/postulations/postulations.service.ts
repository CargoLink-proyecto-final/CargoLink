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
import { CounterOfferDto } from './dto/counter-offer.dto';

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
    if (dto.proposedPrice != null && dto.proposedPrice <= load.price) {
      throw new BadRequestException(
        `El precio propuesto debe ser mayor al precio listado ($${load.price}). Si aceptás ese precio, dejá el campo vacío.`,
      );
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
    if (
      postulation.status !== PostulationStatus.PENDING &&
      postulation.status !== PostulationStatus.NEGOTIATING
    ) {
      throw new BadRequestException('La postulación no está disponible para aceptar');
    }
    if (postulation.load.status !== LoadStatus.PUBLISHED) {
      throw new BadRequestException('La carga ya no está disponible');
    }

    return this.prisma.$transaction(async (tx) => {
      const finalPrice =
        postulation.status === PostulationStatus.NEGOTIATING && postulation.counterOfferPrice != null
          ? postulation.counterOfferPrice
          : postulation.proposedPrice;

      const accepted = await tx.postulation.update({
        where: { id: postulationId },
        data: {
          status: PostulationStatus.ACCEPTED,
          proposedPrice: finalPrice,
          counterOfferPrice: null,
          lastOfferBy: null,
        },
      });

      await tx.postulation.updateMany({
        where: {
          loadId: postulation.loadId,
          id: { not: postulationId },
          status: { in: [PostulationStatus.PENDING, PostulationStatus.NEGOTIATING] },
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

  async counterOffer(postulationId: string, userId: string, userRole: string, dto: CounterOfferDto) {
    const postulation = await this.prisma.postulation.findUnique({
      where: { id: postulationId },
      include: { load: true },
    });
    if (!postulation) throw new NotFoundException('Postulación no encontrada');
    if (
      postulation.status !== PostulationStatus.PENDING &&
      postulation.status !== PostulationStatus.NEGOTIATING
    ) {
      throw new BadRequestException('No se puede contra-ofertar en este estado');
    }
    if (postulation.load.status !== LoadStatus.PUBLISHED) {
      throw new BadRequestException('La carga ya no está disponible');
    }

    const isShipper = userRole === 'CARGO_GENERATOR' && postulation.load.shipperId === userId;
    const isTransporter = userRole === 'TRANSPORTER' && postulation.transporterId === userId;

    if (!isShipper && !isTransporter) {
      throw new ForbiddenException('No tenés permiso para contra-ofertar en esta postulación');
    }

    // Validate it's this user's turn (can't respond to your own offer)
    if (postulation.lastOfferBy === 'SHIPPER' && isShipper) {
      throw new BadRequestException('Ya enviaste una contra-oferta, esperá la respuesta del transportista');
    }
    if (postulation.lastOfferBy === 'TRANSPORTER' && isTransporter) {
      throw new BadRequestException('Ya enviaste tu oferta, esperá la respuesta del dador de carga');
    }

    // Price bound validation
    if (isShipper) {
      // Shipper's counter must not exceed the transporter's current asking price
      const transporterOffer =
        postulation.status === PostulationStatus.NEGOTIATING &&
        postulation.lastOfferBy === 'TRANSPORTER' &&
        postulation.counterOfferPrice != null
          ? postulation.counterOfferPrice
          : postulation.proposedPrice;

      if (transporterOffer == null) {
        throw new BadRequestException(
          'El transportista no propuso un precio, no hay nada que negociar.',
        );
      }
      if (dto.price > postulation.load.price) {
        throw new BadRequestException(
          `El precio no puede superar el precio listado ($${postulation.load.price}). Si querés pagar más, aceptá la oferta del transportista directamente.`,
        );
      }
      if (dto.price >= transporterOffer) {
        throw new BadRequestException(
          `El precio debe ser menor a la oferta del transportista ($${transporterOffer}). Si estás de acuerdo con ese precio, aceptá la postulación directamente.`,
        );
      }
    }

    if (isTransporter) {
      if (dto.price <= postulation.load.price) {
        throw new BadRequestException(
          `El precio debe ser mayor al precio listado ($${postulation.load.price}). Si aceptás ese precio, retirá tu postulación y volvé a postularte sin precio.`,
        );
      }
      if (postulation.counterOfferPrice != null && dto.price <= postulation.counterOfferPrice) {
        throw new BadRequestException(
          `El precio debe ser mayor a la contra-oferta del dador ($${postulation.counterOfferPrice}). Si estás de acuerdo con ese precio, aceptá la contra-oferta directamente.`,
        );
      }
    }

    const lastOfferBy = isShipper ? 'SHIPPER' : 'TRANSPORTER';

    return this.prisma.postulation.update({
      where: { id: postulationId },
      data: {
        counterOfferPrice: dto.price,
        lastOfferBy,
        status: PostulationStatus.NEGOTIATING,
      },
    });
  }

  async acceptOffer(postulationId: string, transporterId: string) {
    const postulation = await this.prisma.postulation.findUnique({
      where: { id: postulationId },
      include: { load: true },
    });
    if (!postulation) throw new NotFoundException('Postulación no encontrada');
    if (postulation.transporterId !== transporterId) {
      throw new ForbiddenException('No es tu postulación');
    }
    if (postulation.status !== PostulationStatus.NEGOTIATING) {
      throw new BadRequestException('No hay una contra-oferta pendiente de aceptar');
    }
    if (postulation.lastOfferBy !== 'SHIPPER') {
      throw new BadRequestException('No hay una contra-oferta del dador de carga para aceptar');
    }
    if (postulation.load.status !== LoadStatus.PUBLISHED) {
      throw new BadRequestException('La carga ya no está disponible');
    }

    return this.prisma.$transaction(async (tx) => {
      const accepted = await tx.postulation.update({
        where: { id: postulationId },
        data: {
          status: PostulationStatus.ACCEPTED,
          proposedPrice: postulation.counterOfferPrice,
          counterOfferPrice: null,
          lastOfferBy: null,
        },
      });

      await tx.postulation.updateMany({
        where: {
          loadId: postulation.loadId,
          id: { not: postulationId },
          status: { in: [PostulationStatus.PENDING, PostulationStatus.NEGOTIATING] },
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
    if (
      postulation.status !== PostulationStatus.PENDING &&
      postulation.status !== PostulationStatus.NEGOTIATING
    ) {
      throw new BadRequestException('Sólo podés retirar postulaciones pendientes o en negociación');
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
