import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RequestMetricsRecorder } from './request-metrics.recorder';

/** Etiqueta para requests que no matchearon ningún endpoint (404, scanners). */
export const UNMATCHED_ROUTE = '(sin ruta)';

/**
 * Ruta con parámetros sin resolver (`/api/loads/:id`). Se lee al terminar la
 * respuesta porque recién ahí Express ya resolvió `req.route`. Usar la URL
 * real (`/api/loads/8f3a…`) crearía una fila por id y guardaría datos de
 * usuarios en una tabla de métricas.
 */
export function routeLabel(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof path !== 'string') return UNMATCHED_ROUTE;
  return `${req.baseUrl ?? ''}${path}`;
}

/** Mide cada request HTTP (duración y código de respuesta). */
@Injectable()
export class RequestMetricsMiddleware implements NestMiddleware {
  constructor(private recorder: RequestMetricsRecorder) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Los preflight de CORS los responde el middleware de CORS sin llegar a
    // ningún endpoint: medirlos solo diluiría los tiempos reales.
    if (req.method === 'OPTIONS') return next();

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      this.recorder.record(req.method, routeLabel(req), res.statusCode, durationMs);
    });
    next();
  }
}
