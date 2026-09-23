import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeProfileStatus } from '../../transporter-profile/profile-completeness';

// Bloquea una acción (hoy: postularse a una carga) si el transportista no
// completó su perfil (documentos + vehículo + declaración jurada). No se
// aplica globalmente — solo en los endpoints donde importa, igual que
// RolesGuard.
@Injectable()
export class ProfileCompleteGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();

    const [fullUser, vehicle, documents] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { cuit: true, licenseCategory: true, licenseExpiresAt: true, termsAcceptedAt: true },
      }),
      this.prisma.vehicle.findUnique({ where: { userId: user.id } }),
      this.prisma.document.findMany({ where: { userId: user.id }, select: { type: true } }),
    ]);

    const status = computeProfileStatus({
      user: fullUser ?? {
        cuit: null,
        licenseCategory: null,
        licenseExpiresAt: null,
        termsAcceptedAt: null,
      },
      hasVehicle: !!vehicle,
      documentTypes: documents.map((d) => d.type),
    });

    if (!status.complete) {
      throw new ForbiddenException({
        message: 'Completá tu perfil de transportista antes de postularte a una carga',
        missing: status.missing,
      });
    }
    return true;
  }
}
