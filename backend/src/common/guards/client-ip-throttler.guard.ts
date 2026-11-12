import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * IP real del cliente para el rate limit.
 *
 * En el VPS el backend no publica puertos: todo entra por el Cloudflare Tunnel,
 * así que `req.ip` es siempre la IP del contenedor `cloudflared` y, sin esto,
 * TODOS los usuarios compartirían un mismo contador (diez logins fallidos de
 * cualquiera bloquearían a todo el mundo). Cloudflare pone la IP de origen en
 * `CF-Connecting-IP`. Si algún día el backend se expone directo, este header lo
 * podría falsear el cliente: en ese caso hay que dejar de confiar en él.
 */
export function clientIp(req: RequestLike): string {
  const header = (name: string) => {
    const value = req.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const cf = header('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return req.ip ?? 'unknown';
}

@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req as RequestLike);
  }
}
