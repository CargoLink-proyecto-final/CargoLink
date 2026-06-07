import { MailService } from './mail.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  let sendMail: jest.Mock;

  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });

    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue(
      'https://ethereal.email/message/preview',
    );

    // Start from a clean slate of SMTP-related env on every test.
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_FROM;
    delete process.env.FRONTEND_URL;

    service = new MailService();
    // Silence logger output during tests.
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('transport selection', () => {
    it('uses Ethereal test account when SMTP_HOST is not set', async () => {
      await service.sendVerificationEmail('to@example.com', 'Test', 'tok');

      expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(1);
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
      });
    });

    it('uses real SMTP transport when both SMTP_HOST and SMTP_USER are set', async () => {
      process.env.SMTP_HOST = 'smtp.real.com';
      process.env.SMTP_USER = 'real-user';
      process.env.SMTP_PASSWORD = 'real-pass';
      process.env.SMTP_PORT = '465';
      process.env.SMTP_SECURE = 'true';

      await service.sendVerificationEmail('to@example.com', 'Test', 'tok');

      expect(nodemailer.createTestAccount).not.toHaveBeenCalled();
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.real.com',
        port: 465,
        secure: true,
        auth: { user: 'real-user', pass: 'real-pass' },
      });
    });

    it('defaults port to 587 and secure to false when not provided', async () => {
      process.env.SMTP_HOST = 'smtp.real.com';
      process.env.SMTP_USER = 'real-user';

      await service.sendVerificationEmail('to@example.com', 'Test', 'tok');

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 587, secure: false }),
      );
    });

    it('falls back to Ethereal when SMTP_HOST is set but SMTP_USER is empty', async () => {
      process.env.SMTP_HOST = 'smtp.real.com';
      // SMTP_USER intentionally unset.

      await service.sendVerificationEmail('to@example.com', 'Test', 'tok');

      expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(1);
    });

    it('caches the transporter across multiple sends', async () => {
      await service.sendVerificationEmail('to@example.com', 'Test', 'tok');
      await service.sendPasswordResetEmail('to@example.com', 'Test', 'tok2');

      // createTransport called once despite two sends.
      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledTimes(2);
    });
  });

  describe('from address', () => {
    it('uses the default from address when SMTP_FROM is not set', async () => {
      await service.sendVerificationEmail('to@example.com', 'Test', 'tok');

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'CargoLink <no-reply@cargolink.local>' }),
      );
    });

    it('uses SMTP_FROM when configured with a real SMTP transport', async () => {
      process.env.SMTP_HOST = 'smtp.real.com';
      process.env.SMTP_USER = 'real-user';
      process.env.SMTP_FROM = 'Custom <hi@custom.com>';

      await service.sendVerificationEmail('to@example.com', 'Test', 'tok');

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'Custom <hi@custom.com>' }),
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('builds a verification link with the encoded token and default frontend URL', async () => {
      await service.sendVerificationEmail('to@example.com', 'Alice', 'a b/c');

      const arg = sendMail.mock.calls[0][0];
      expect(arg.to).toBe('to@example.com');
      expect(arg.subject).toContain('Verificá');
      const expectedLink =
        'http://localhost:3000/auth/verify-email?token=a%20b%2Fc';
      expect(arg.text).toContain(expectedLink);
      expect(arg.html).toContain(expectedLink);
      expect(arg.text).toContain('Alice');
      expect(arg.html).toContain('Alice');
    });

    it('uses FRONTEND_URL when set', async () => {
      process.env.FRONTEND_URL = 'https://app.cargolink.com';

      await service.sendVerificationEmail('to@example.com', 'Alice', 'tok');

      const arg = sendMail.mock.calls[0][0];
      expect(arg.text).toContain(
        'https://app.cargolink.com/auth/verify-email?token=tok',
      );
    });

    it('logs the preview URL when getTestMessageUrl returns one', async () => {
      const logSpy = jest.spyOn((service as any).logger, 'log');
      await service.sendVerificationEmail('to@example.com', 'Alice', 'tok');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Verification email preview'),
      );
    });

    it('does not log a preview URL when getTestMessageUrl returns false', async () => {
      (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue(false);
      const logSpy = jest.spyOn((service as any).logger, 'log');
      await service.sendVerificationEmail('to@example.com', 'Alice', 'tok');
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Verification email preview'),
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('builds a reset link with the encoded token', async () => {
      await service.sendPasswordResetEmail('to@example.com', 'Bob', 'r&t');

      const arg = sendMail.mock.calls[0][0];
      expect(arg.to).toBe('to@example.com');
      expect(arg.subject).toContain('Restablecer');
      const expectedLink =
        'http://localhost:3000/auth/reset-password?token=r%26t';
      expect(arg.text).toContain(expectedLink);
      expect(arg.html).toContain(expectedLink);
      expect(arg.text).toContain('Bob');
    });

    it('logs the preview URL for the reset email', async () => {
      const logSpy = jest.spyOn((service as any).logger, 'log');
      await service.sendPasswordResetEmail('to@example.com', 'Bob', 'tok');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Password reset email preview'),
      );
    });
  });
});
