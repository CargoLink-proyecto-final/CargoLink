import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { hash } from 'bcrypt';
import {
  JoinRequestStatus,
  LoadStatus,
  PostulationStatus,
  Role,
  TripStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from '../auth/dto/register.dto';
import {
  CUIT_DOCUMENT_TYPES,
  LICENSE_DOCUMENT_TYPES,
} from '../transporter-profile/profile-completeness';
import { sendApprovedDocumentsBackToReview } from '../transporter-profile/profile-status';

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

// Nombre con el que queda una cuenta dada de baja. La contraparte sigue viendo
// el viaje y la calificación, atribuidos a alguien que ya no está.
export const DELETED_USER_FIRST_NAME = 'Usuario';
export const DELETED_USER_LAST_NAME = 'eliminado';
export const DELETED_COMPANY_NAME = 'Empresa eliminada';

/**
 * Campos de `User` que pueden salir por HTTP.
 *
 * Es una allowlist y no una lista de exclusión a propósito: devolver el registro
 * crudo de Prisma filtraba el hash de la contraseña y los tokens de verificación
 * y de reset de password, y con una denylist cada columna nueva del modelo se
 * expone sola hasta que alguien se acuerde de agregarla.
 *
 * Todo lo que devuelva un usuario por la API tiene que usar este select. La
 * excepción es `findByEmail`, que necesita el hash para comparar credenciales y
 * por eso nunca se devuelve directo desde un controller.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  companyName: true,
  industry: true,
  avatarUrl: true,
  zoneLat: true,
  zoneLng: true,
  zoneRadiusKm: true,
  cuit: true,
  licenseCategory: true,
  licenseExpiresAt: true,
  termsAcceptedAt: true,
  isActive: true,
  emailVerified: true,
  companyId: true,
  createdAt: true,
} as const;

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
      // Era el último método que devolvía el registro completo. Hoy `register`
      // sólo responde `{message, email}`, así que no filtraba nada — pero deja
      // de ser cierto apenas alguien devuelva este valor tal cual.
      select: PUBLIC_USER_SELECT,
    });
  }

  // Única lectura que trae el registro completo: `login` y los flujos de reset
  // necesitan el hash y los tokens. No exponer su retorno desde un controller.
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });
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
        select: PUBLIC_USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async update(id: string, data: Partial<{ firstName: string; lastName: string; phone: string; companyName: string; industry: string; zoneLat: number; zoneLng: number; zoneRadiusKm: number; cuit: string; licenseCategory: string; licenseExpiresAt: string }>) {
    // Prisma exige un DateTime ISO completo; el DTO solo valida "es una fecha"
    // (acepta "2028-01-01" sin hora), así que lo normalizamos acá.
    const { licenseExpiresAt, ...rest } = data;
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { cuit: true, licenseCategory: true, licenseExpiresAt: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...rest,
          ...(licenseExpiresAt !== undefined ? { licenseExpiresAt: new Date(licenseExpiresAt) } : {}),
        },
        select: PUBLIC_USER_SELECT,
      });

      // La constancia de AFIP y la licencia se aprobaron contra los datos
      // viejos: si el transportista los cambia, vuelven a revisión del admin.
      if (before) {
        if (updated.cuit !== before.cuit) {
          await sendApprovedDocumentsBackToReview(tx, id, CUIT_DOCUMENT_TYPES);
        }
        if (
          updated.licenseCategory !== before.licenseCategory ||
          updated.licenseExpiresAt?.getTime() !== before.licenseExpiresAt?.getTime()
        ) {
          await sendApprovedDocumentsBackToReview(tx, id, LICENSE_DOCUMENT_TYPES);
        }
      }
      return updated;
    });
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
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: PUBLIC_USER_SELECT,
    });
  }

  async reactivate(id: string) {
    await this.findById(id);
    // `deletedAt` no viaja en PUBLIC_USER_SELECT, así que hay que leerla aparte.
    // Sin este chequeo un admin podía revivir una cuenta dada de baja por su
    // titular: los datos personales ya no están, pero la fila volvía a operar.
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    if (row?.deletedAt) {
      throw new ConflictException(
        'La cuenta fue eliminada por su titular y no puede reactivarse.',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: PUBLIC_USER_SELECT,
    });
  }

  /**
   * Baja definitiva pedida por el propio usuario, requisito de la App Store para
   * toda app con registro (guideline 5.1.1(v)).
   *
   * No borra la fila: la anonimiza. Un `delete` en cascada se llevaría cargas,
   * viajes, mensajes y calificaciones que también son de la contraparte — el
   * transportista perdería su historial y sus calificaciones porque el dador se
   * dio de baja. Lo que se borra es todo dato personal; lo que sobrevive es el
   * registro operativo, atribuido a un "Usuario eliminado".
   *
   * El email se reescribe a un placeholder único en el dominio reservado
   * `.invalid` (RFC 2606) por dos razones: la columna es `@unique`, y así la
   * dirección real queda libre para registrarse de nuevo.
   */
  async deleteOwnAccount(id: string) {
    const user = await this.findById(id);

    // Hash por fuera de la transacción: bcrypt con cost 10 tarda ~100ms y no
    // hay razón para tener la transacción abierta mientras corre.
    const unusablePassword = await hash(randomBytes(32).toString('hex'), 10);
    // `ownerId` es @unique y la titularidad sólo se crea en el registro, así que
    // esta lectura no puede quedar desactualizada respecto de la transacción.
    const ownedCompany = await this.prisma.company.findUnique({
      where: { ownerId: id },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // El chequeo va adentro: con dos sesiones abiertas del mismo usuario
      // (publicar una carga desde el web mientras se borra desde el celular),
      // hacerlo afuera dejaba una carga PUBLISHED de un "Usuario eliminado".
      const [activeLoads, activeTrips] = await Promise.all([
        tx.load.count({ where: { shipperId: id, status: { in: ACTIVE_LOAD_STATUSES } } }),
        tx.trip.count({ where: { carrierId: id, status: { in: ACTIVE_TRIP_STATUSES } } }),
      ]);
      if (activeLoads > 0 || activeTrips > 0) {
        throw new ConflictException(
          'No se puede eliminar la cuenta: tiene cargas o viajes activos. Cerralos primero.',
        );
      }

      await tx.user.update({
        where: { id },
        data: {
          email: `deleted-${id}@cargolink.invalid`,
          // Deja la columna con un hash válido en vez de un string vacío, así
          // ningún `compare` acierta.
          password: unusablePassword,
          firstName: DELETED_USER_FIRST_NAME,
          lastName: DELETED_USER_LAST_NAME,
          phone: null,
          companyName: null,
          industry: null,
          avatarUrl: null,
          zoneLat: null,
          zoneLng: null,
          zoneRadiusKm: null,
          // Corta las push al dispositivo y lo desvincula de la empresa.
          expoPushToken: null,
          companyId: null,
          resetToken: null,
          resetTokenExp: null,
          emailVerificationToken: null,
          emailVerificationTokenExp: null,
          emailVerified: false,
          isActive: false,
          deletedAt: new Date(),
        },
      });

      // Retira las postulaciones abiertas. Sin esto el dador de carga podría
      // aceptar la postulación de alguien que ya no existe: se abriría un viaje
      // asignado a una cuenta que no puede loguear nunca más y la carga quedaría
      // trabada en ASSIGNED sin forma de recuperarla.
      await tx.postulation.updateMany({
        where: {
          transporterId: id,
          status: { in: [PostulationStatus.PENDING, PostulationStatus.NEGOTIATING] },
        },
        data: { status: PostulationStatus.WITHDRAWN },
      });

      // Si era titular de una empresa, la empresa también pierde sus datos y se
      // queda sin miembros. No hay transferencia de titularidad ni baja de
      // empresa en el producto, así que dejarla intacta significaría que el
      // nombre (que en un monotributista suele ser su propio nombre) sobreviva
      // en una empresa sin administrador posible.
      if (ownedCompany) {
        await tx.user.updateMany({
          where: { companyId: ownedCompany.id },
          data: { companyId: null },
        });
        await tx.companyJoinRequest.updateMany({
          where: { companyId: ownedCompany.id, status: JoinRequestStatus.PENDING },
          data: { status: JoinRequestStatus.REJECTED, decidedAt: new Date() },
        });
        await tx.company.update({
          where: { id: ownedCompany.id },
          data: { name: DELETED_COMPANY_NAME },
        });
      }
    });

    this.logger.log(`Cuenta ${id} eliminada y anonimizada a pedido del usuario`);
    // No devuelve el usuario: ya no hay nada que el cliente pueda mostrar, y el
    // JWT que hizo la request queda apuntando a una cuenta que no puede loguear.
    return { deleted: true, email: user.email };
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
      select: PUBLIC_USER_SELECT,
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
        select: PUBLIC_USER_SELECT,
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
