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
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
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

    const hashedPassword = await bcrypt.hash(dto.password, 10);
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

    const verificationToken = randomBytes(32).toString('hex');
    const verificationExp = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
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
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
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

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken: token,
    };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
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

    const accessToken = this.generateToken(user.id, user.email, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
    };
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

    const verificationToken = randomBytes(32).toString('hex');
    const verificationExp = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationTokenExp: verificationExp,
      },
    });

    try {
      await this.mailService.sendVerificationEmail(user.email, user.firstName, verificationToken);
    } catch (err) {
      this.logger.error(`Failed to resend verification email to ${user.email}`, err as Error);
    }
    return opaqueResponse;
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return { message: 'Si el correo existe, se ha enviado un enlace de restablecimiento' };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExp = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExp },
    });

    try {
      await this.mailService.sendPasswordResetEmail(user.email, user.firstName, resetToken);
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${user.email}`, err as Error);
    }

    return { message: 'Si el correo existe, se ha enviado un enlace de restablecimiento' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExp: { gte: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Token de restablecimiento inválido o expirado');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    return { message: 'La contraseña se ha restablecido exitosamente' };
  }

  private generateToken(userId: string, email: string, role: string): string {
    return this.jwtService.sign({ sub: userId, email, role });
  }
}
