import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { LoadStatus, Role, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from '../auth/dto/register.dto';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Estados que mantienen "viva" una operación: mientras existan, la cuenta no se puede
// desactivar (criterio "una cuenta con viajes o cargas activas no puede eliminarse").
const ACTIVE_LOAD_STATUSES: LoadStatus[] = [
  LoadStatus.PUBLISHED,
  LoadStatus.ASSIGNED,
  LoadStatus.IN_TRANSIT,
];
const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  TripStatus.PENDING,
  TripStatus.ACCEPTED,
  TripStatus.IN_PROGRESS,
];

// Roles que el admin puede asignar desde el panel. COMPANY_ADMIN queda afuera: implica
// titularidad de una Company (ownership) y se gestiona por su propio flujo.
const ASSIGNABLE_ROLES: Role[] = [Role.CARGO_GENERATOR, Role.TRANSPORTER, Role.ADMIN];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async create(data: RegisterDto & { password: string }) {
    // firstName/lastName son opcionales en el DTO (las cuentas de empresa no los
    // mandan); Prisma los exige como string, así que garantizamos un valor.
    return this.prisma.user.create({
      data: { ...data, firstName: data.firstName ?? '', lastName: data.lastName ?? '' },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findAll(params?: { role?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const where = params?.role ? { role: params.role as any } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          companyName: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async update(id: string, data: Partial<{ firstName: string; lastName: string; phone: string; companyName: string; industry: string; zoneLat: number; zoneLng: number; zoneRadiusKm: number }>) {
    return this.prisma.user.update({ where: { id }, data });
  }

  // True si el usuario tiene cargas (como dador) o viajes (como transportista) en curso.
  async hasActiveOperations(userId: string): Promise<boolean> {
    const [activeLoads, activeTrips] = await Promise.all([
      this.prisma.load.count({
        where: { shipperId: userId, status: { in: ACTIVE_LOAD_STATUSES } },
      }),
      this.prisma.trip.count({
        where: { carrierId: userId, status: { in: ACTIVE_TRIP_STATUSES } },
      }),
    ]);
    return activeLoads > 0 || activeTrips > 0;
  }

  // Desactiva la cuenta. Bloquea si hay operaciones activas (deben cerrarse primero).
  async deactivate(id: string) {
    const user = await this.findById(id);
    if (!user.isActive) return user;
    if (await this.hasActiveOperations(id)) {
      throw new ConflictException(
        'No se puede desactivar la cuenta: tiene cargas o viajes activos. Cerralos primero.',
      );
    }
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  async reactivate(id: string) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  // Cambio de email por un admin. Como el email es el identificador, exige revalidación:
  // se marca la cuenta como no verificada y se manda el correo de verificación a la nueva
  // dirección (reutiliza el flujo de verify-email existente).
  async changeUserEmail(id: string, newEmail: string) {
    const user = await this.findById(id);
    const normalizedEmail = newEmail.trim().toLowerCase();

    if (normalizedEmail === user.email.toLowerCase()) {
      throw new BadRequestException('El correo nuevo es igual al actual');
    }
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('El correo ya está registrado');
    }

    const verificationToken = randomBytes(32).toString('hex');
    const verificationExp = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: normalizedEmail,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationTokenExp: verificationExp,
      },
    });

    try {
      await this.mailService.sendVerificationEmail(normalizedEmail, updated.firstName, verificationToken);
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${normalizedEmail}`, err as Error);
    }
    return updated;
  }

  // Cambio de rol por un admin. Registra quién y cuándo en RoleChangeLog (auditoría).
  async changeRole(targetId: string, newRole: Role, adminId: string) {
    if (targetId === adminId) {
      throw new ForbiddenException('No podés cambiar tu propio rol');
    }

    const target = await this.findById(targetId);

    if (target.role === Role.COMPANY_ADMIN || newRole === Role.COMPANY_ADMIN) {
      throw new BadRequestException(
        'El rol de administrador de empresa se gestiona desde el flujo de empresas, no desde acá.',
      );
    }
    if (!ASSIGNABLE_ROLES.includes(newRole)) {
      throw new BadRequestException('El rol indicado no se puede asignar');
    }
    if (target.role === newRole) {
      throw new BadRequestException('El usuario ya tiene ese rol');
    }

    const oldRole = target.role;
    // Si deja de ser transportista, ya no puede pertenecer a una empresa.
    const clearCompany = oldRole === Role.TRANSPORTER ? { companyId: null } : {};

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetId },
        data: { role: newRole, ...clearCompany },
      }),
      this.prisma.roleChangeLog.create({
        data: { userId: targetId, changedById: adminId, oldRole, newRole },
      }),
    ]);
    return updated;
  }

  async getRoleHistory(userId: string) {
    await this.findById(userId);
    return this.prisma.roleChangeLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        changedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }
}
