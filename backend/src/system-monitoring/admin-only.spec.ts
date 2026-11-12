import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlatformMetricsController } from '../platform-metrics/platform-metrics.controller';
import { SystemMonitoringController } from './system-monitoring.controller';

// Estos endpoints exponen datos de toda la plataforma y del servidor: tienen
// que quedar cerrados al ADMIN aunque alguien agregue un método nuevo.
describe.each([
  ['SystemMonitoringController', SystemMonitoringController],
  ['PlatformMetricsController', PlatformMetricsController],
])('%s', (_name, controller) => {
  it('requires a JWT and the ADMIN role at class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(['ADMIN']);
  });
});
