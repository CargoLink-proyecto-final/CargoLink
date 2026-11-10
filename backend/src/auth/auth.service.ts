import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  BCRYPT_ROUNDS,
  DUMMY_PASSWORD_HASH,
  generateOpaqueToken,
  hashToken,
  needsRehash,
} from './token-crypto';
import { Role } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, SELF_REGISTRABLE_ROLES } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenService } from './refresh-token.service';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService,
    private refreshTokens: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto) {
    // El DTO ya lo filtra; esto es defensa en profundidad por si `register` se
    // llama sin pasar por el ValidationPipe. Un ADMIN nunca se auto-registra.
    if (!(SELF_REGISTRABLE_ROLES as readonly string[]).includes(dto.role)) {
      throw new ForbiddenException('Ese rol no se puede elegir al registrarse');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('El correo ya está registrado');
    }

    // Registrarse como empresa exige un nombre: se usa para crear la Company
    // que este usuario administrará (request + approval de conductores).
    if (dto.role === Role.COMPANY_ADMIN && !dto.companyName?.trim()) {
      throw new BadRequestException(
        'El nombre de la empresa es obligatorio para registrar una empresa',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // Una empresa no tiene nombre/apellido personales: el nombre visible (y las
    // iniciales del avatar) salen del nombre de la empresa.
    const isCompany = dto.role === Role.COMPANY_ADMIN;
    const firstName = isCompany ? dto.companyName!.trim() : (dto.firstName ?? '');
    const lastName = isCompany ? '' : (dto.lastName ?? '');
    const user = await this.usersService.create({
      ...dto,
      firstName,
      lastName,
      password: hashedPassword,
    });

    if (isCompany) {
      await this.prisma.company.create({
        data: { name: dto.companyName!.trim(), ownerId: user.id },
      });
    }

    // En la base queda el hash; el token en claro solo viaja en el mail.
    const { token: verificationToken, tokenHash: verificationHash } = generateOpaqueToken();
    const verificationExp = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationHash,
        emailVerificationTokenExp: verificationExp,
      },
    });

    try {
      await this.mailService.sendVerificationEmail(user.email, user.firstName, verificationToken);
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${user.email}`, err as Error);
      // Registration still succeeds; the user can request a resend.
    }

    return {
      message:
        'Cuenta creada. Te enviamos un correo para verificar tu dirección. Revisá tu bandeja de entrada.',
      email: user.email,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    // Siempre se corre bcrypt, exista o no el email: si no, el login sin cuenta
    // respondía en ~1 ms y con cuenta en ~300 ms, y medir eso alcanzaba para
    // saber qué emails están registrados.
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Cuentas con hash de costo viejo (10): se re-hashean ahora que tenemos la
    // clave en claro. Así todas convergen al costo de DUMMY_PASSWORD_HASH y el
    // tiempo del login deja de distinguir cuentas existentes de inexistentes.
    if (needsRehash(user.password)) {
      const upgraded = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      await this.prisma.user
        .update({ where: { id: user.id }, data: { password: upgraded } })
        .catch((err) => this.logger.warn(`Could not upgrade password hash for ${user.id}: ${err}`));
    }

    if (!user.emailVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Tenés que verificar tu correo electrónico antes de iniciar sesión.',
        email: user.email,
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Tu cuenta está desactivada. Contactá a un administrador para reactivarla.',
      });
    }

    return this.startSession(user);
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashToken(token),
        emailVerificationTokenExp: { gte: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Enlace de verificación inválido o expirado');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExp: null,
      },
    });

    return this.startSession(user);
  }

  /**
   * Canjea el refresh token por un access token nuevo (y el siguiente refresh
   * token: rotan en cada uso). El usuario se relee de la base, así que un cambio
   * de rol o una desactivación se reflejan en la próxima renovación.
   */
  async refresh(refreshToken: string) {
    const session = await this.refreshTokens.rotate(refreshToken);
    const { user } = session;
    return {
      user,
      accessToken: this.generateToken(user.id, user.email, user.role),
      refreshToken: session.refreshToken,
    };
  }

  /** Cierra la sesión del refresh token. Idempotente: un token inválido no da error. */
  async logout(refreshToken: string) {
    await this.refreshTokens.revoke(refreshToken);
    return { message: 'Sesión cerrada' };
  }

  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    // Don't leak whether the email exists.
    const opaqueResponse = {
      message: 'Si existe una cuenta sin verificar para ese correo, te enviamos un nuevo enlace.',
    };
    // `!isActive` cubre las cuentas eliminadas, que quedan con emailVerified en
    // false: sin este corte se generaba un token y se intentaba mandar un mail a
    // la dirección placeholder `@cargolink.invalid`, garantizando un bounce
    // contra el SMTP de producción.
    if (!user || user.emailVerified || !user.isActive) return opaqueResponse;

    const { token: verificationToken, tokenHash: verificationHash } = generateOpaqueToken();
    const verificationExp = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationHash,
        emailVerificationTokenExp: verificationExp,
      },
    });

    // Sin await: si la respuesta esperara al SMTP (segundos) solo cuando la
    // cuenta existe, el tiempo de respuesta delataría qué emails están dados de alta.
    this.mailService
      .sendVerificationEmail(user.email, user.firstName, verificationToken)
      .catch((err) =>
        this.logger.error(`Failed to resend verification email to ${user.email}`, err as Error),
      );
    return opaqueResponse;
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    // Mismo criterio que resendVerification: una cuenta eliminada/desactivada no
    // recibe link (su email es un placeholder `@cargolink.invalid`).
    if (!user || !user.isActive) {
      // Return success even if user not found to prevent email enumeration
      return { message: 'Si el correo existe, se ha enviado un enlace de restablecimiento' };
    }

    const { token: resetToken, tokenHash: resetTokenHash } = generateOpaqueToken();
    const resetTokenExp = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: resetTokenHash, resetTokenExp },
    });

    // Sin await, por la misma razón de tiempos que en resendVerification.
    this.mailService
      .sendPasswordResetEmail(user.email, user.firstName, resetToken)
      .catch((err) =>
        this.logger.error(`Failed to send password reset email to ${user.email}`, err as Error),
      );

    return { message: 'Si el correo existe, se ha enviado un enlace de restablecimiento' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: hashToken(token),
        resetTokenExp: { gte: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Token de restablecimiento inválido o expirado');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    // Si la clave se reseteó porque alguien más la conocía, sus sesiones abiertas
    // tienen que morir: sin refresh token, su access token vence en minutos.
    await this.refreshTokens.revokeAllForUser(user.id);

    return { message: 'La contraseña se ha restablecido exitosamente' };
  }

  private async startSession(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
  }) {
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken: this.generateToken(user.id, user.email, user.role),
      refreshToken: await this.refreshTokens.issue(user.id),
    };
  }

  private generateToken(userId: string, email: string, role: string): string {
    return this.jwtService.sign({ sub: userId, email, role });
  }
}
