import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { loadProfileStatus } from '../../transporter-profile/profile-status';

// Bloquea una acción (hoy: postularse a una carga) si el perfil del
// transportista no está aprobado: tiene que estar completo (documentos +
// vehículo + declaración jurada) y con todos los documentos obligatorios
// aprobados por un admin (CU-11). Ver la carga sí está permitido. No se aplica
// globalmente — solo en los endpoints donde importa, igual que RolesGuard.
@Injectable()
export class ProfileApprovedGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    const status = await loadProfileStatus(this.prisma, user.id);

    if (!status) {
      throw new ForbiddenException({
        message: 'Completá tu perfil de transportista antes de postularte a una carga',
        state: 'INCOMPLETE',
        missing: [],
      });
    }
    if (status.approved) return true;

    const message =
      status.state === 'PENDING_REVIEW'
        ? 'Tu documentación está en revisión. Vas a poder postularte cuando un administrador la apruebe'
        : status.state === 'REJECTED'
          ? 'Algunos documentos fueron rechazados. Revisalos en tu perfil antes de postularte'
          : 'Completá tu perfil de transportista antes de postularte a una carga';

    throw new ForbiddenException({
      message,
      state: status.state,
      missing: status.missing,
      pendingReview: status.pendingReview,
      rejected: status.rejected,
    });
  }
}
