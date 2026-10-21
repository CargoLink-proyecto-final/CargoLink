import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

// Node 20 prueba IPv4 e IPv6 en paralelo ("happy eyeballs") y corta cada intento
// a los 250 ms. Desde el VPS el connect a OSRM tarda ~265 ms y no hay ruta IPv6,
// así que la llamada fallaba con ETIMEDOUT y el viaje se cerraba sin distancia.
// 2 s deja margen sin pisar el timeout de OSRM (5 s).
setDefaultAutoSelectFamilyAttemptTimeout(2000);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS_ORIGIN admite uno o varios orígenes separados por coma (ej. durante una
  // migración de dominio, el viejo y el nuevo a la vez).
  const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';
  const corsOrigins = (process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    // Si CORS_ORIGIN quedara vacío (ej. "," o " "), caer al default en vez de
    // pasar un array vacío, que bloquearía todo origen cruzado.
    origin: corsOrigins.length > 0 ? corsOrigins : [DEFAULT_CORS_ORIGIN],
    credentials: true,
  });

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('CargoLink API')
    .setDescription('CargoLink API - Plataforma de Transporte de Carga por Carretera')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`CargoLink API running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
