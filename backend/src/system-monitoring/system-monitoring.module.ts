import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestMetricsMiddleware } from './request-metrics.middleware';
import { RequestMetricsRecorder } from './request-metrics.recorder';
import { SystemMonitoringController } from './system-monitoring.controller';
import { SystemMonitoringService } from './system-monitoring.service';
import { UptimeService } from './uptime.service';

/**
 * Monitoreo del propio backend para el panel del admin: caídas (sesiones del
 * proceso + heartbeat), tiempos de respuesta y errores por endpoint, y salud
 * en vivo de la DB y los servicios externos. Ver docs/monitoreo.md.
 */
@Module({
  controllers: [SystemMonitoringController],
  providers: [RequestMetricsRecorder, UptimeService, SystemMonitoringService],
})
export class SystemMonitoringModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestMetricsMiddleware).forRoutes('*');
  }
}
