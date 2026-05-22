import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string = 'CargoLink <no-reply@cargolink.local>';

  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    // Require both host and user before treating SMTP as configured — a
    // half-filled .env (host set, credentials missing) would otherwise try
    // to talk to a real server unauthenticated and silently fail.
    if (host && user) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass: process.env.SMTP_PASSWORD },
      });
      if (process.env.SMTP_FROM) this.fromAddress = process.env.SMTP_FROM;
      this.logger.log(`Mail transport: SMTP ${host}`);
      return this.transporter;
    }

    if (host && !user) {
      this.logger.warn(
        `SMTP_HOST is set but SMTP_USER is empty — falling back to Ethereal. ` +
          `Fill SMTP_USER and SMTP_PASSWORD in .env to deliver real emails.`,
      );
    }

    // Dev fallback: Ethereal Email — auto-creates a fake inbox and gives
    // us preview URLs for every message we send. No real delivery.
    const account = await nodemailer.createTestAccount();
    this.transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
    this.logger.warn(
      `SMTP_HOST not set — using Ethereal test account (${account.user}). ` +
        `Emails will NOT be delivered; preview URLs are logged.`,
    );
    return this.transporter;
  }

  async sendVerificationEmail(to: string, firstName: string, token: string): Promise<void> {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontend}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const transporter = await this.getTransporter();
    const info = await transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Verificá tu correo electrónico en CargoLink',
      text:
        `Hola ${firstName},\n\n` +
        `Para activar tu cuenta en CargoLink, abrí el siguiente enlace en tu navegador:\n\n` +
        `${link}\n\n` +
        `El enlace expira en 24 horas.\n\n` +
        `Si no creaste esta cuenta, podés ignorar este correo.\n`,
      html:
        `<p>Hola ${firstName},</p>` +
        `<p>Para activar tu cuenta en CargoLink, hacé clic en el siguiente enlace:</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>El enlace expira en 24 horas.</p>` +
        `<p>Si no creaste esta cuenta, podés ignorar este correo.</p>`,
    });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) this.logger.log(`Verification email preview: ${preview}`);
  }

  async sendPasswordResetEmail(to: string, firstName: string, token: string): Promise<void> {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontend}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const transporter = await this.getTransporter();
    const info = await transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: 'Restablecer contraseña en CargoLink',
      text:
        `Hola ${firstName},\n\n` +
        `Recibimos una solicitud para restablecer la contraseña de tu cuenta.\n\n` +
        `Para crear una nueva contraseña, abrí el siguiente enlace:\n\n` +
        `${link}\n\n` +
        `El enlace expira en 1 hora.\n\n` +
        `Si no solicitaste este cambio, podés ignorar este correo.\n`,
      html:
        `<p>Hola ${firstName},</p>` +
        `<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>` +
        `<p>Para crear una nueva contraseña, hacé clic en el siguiente enlace:</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>El enlace expira en 1 hora.</p>` +
        `<p>Si no solicitaste este cambio, podés ignorar este correo.</p>`,
    });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) this.logger.log(`Password reset email preview: ${preview}`);
  }
}
