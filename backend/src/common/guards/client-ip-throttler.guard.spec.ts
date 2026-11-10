import { clientIp } from './client-ip-throttler.guard';

describe('clientIp', () => {
  // Detrás del Cloudflare Tunnel `req.ip` es siempre el contenedor cloudflared:
  // si se usara eso, todos los usuarios compartirían el contador del rate limit.
  it('prefers the CF-Connecting-IP header set by Cloudflare', () => {
    expect(
      clientIp({
        ip: '172.18.0.5',
        headers: { 'cf-connecting-ip': '200.1.2.3', 'x-forwarded-for': '10.0.0.1' },
      }),
    ).toBe('200.1.2.3');
  });

  it('falls back to the first X-Forwarded-For hop', () => {
    expect(
      clientIp({ ip: '172.18.0.5', headers: { 'x-forwarded-for': '200.1.2.3, 172.18.0.5' } }),
    ).toBe('200.1.2.3');
  });

  it('uses the socket IP when there are no proxy headers (local dev)', () => {
    expect(clientIp({ ip: '127.0.0.1', headers: {} })).toBe('127.0.0.1');
  });
});
