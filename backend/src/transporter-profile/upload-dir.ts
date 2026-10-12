import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';

// Directorio donde viven los documentos subidos, uno por usuario
// (`<uploadDir>/<userId>/`). Lo leen tanto el perfil del transportista (sube y
// sirve los archivos) como la baja de cuenta (los borra), así que la resolución
// vive en un solo lugar.
//
// Absoluto siempre: `res.sendFile` (usado para servir el archivo) lo exige, y
// en Docker UPLOAD_DIR ya viene absoluto (/app/uploads) — esto solo importa
// para el default relativo de dev local.
export function resolveUploadDir(configService: ConfigService): string {
  return resolve(configService.get<string>('UPLOAD_DIR', './uploads'));
}
