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

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      ...dto,
      password: hashedPassword,
    });

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
    if (!user || user.emailVerified) return opaqueResponse;

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

    // In production, send email with reset link containing the token
    // For development, log the token
    console.log(`Password reset token for ${email}: ${resetToken}`);

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
