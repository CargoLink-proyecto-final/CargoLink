# Métricas del admin y monitoreo del sistema

El panel del admin de plataforma (`ADMIN`) responde dos preguntas distintas:

1. **¿La plataforma funciona como negocio?** Métricas de uso: el marketplace, el dinero que se mueve, la operación, la verificación de transportistas y el crecimiento. Pantalla `/dashboard/admin`, endpoint `GET /api/admin/metrics`.
2. **¿El servicio está sano?** Monitoreo técnico: caídas, tiempos de respuesta, errores, base de datos y servicios externos. Pantalla `/dashboard/admin/system`, endpoints `GET /api/admin/system/health` y `GET /api/admin/system/metrics`.

Todos los endpoints son solo `ADMIN` (guard a nivel de clase, con test que lo fija).

## Métricas de uso — `platform-metrics/`

Source: [`../backend/src/platform-metrics/`](../backend/src/platform-metrics/). Los cálculos son funciones puras en `platform-metrics.ts` (con tests); el service solo trae los campos mínimos de la DB. Las tasas usan una **ventana de 90 días**; las series, los **últimos 6 meses**.

| Métrica | Cómo se calcula | Por qué importa |
|---|---|---|
| Movido este mes | Suma del precio pactado de los viajes completados en el mes | Volumen real que pasa por la plataforma |
| Cargas asignadas | Cargas con viaje / cargas que ya tuvieron 48 h para conseguir transportista | Si las cargas no se asignan, el marketplace no funciona. Las recién publicadas no cuentan: todavía no fallaron |
| Entregas a tiempo | `completedAt <= deliveryDate` sobre viajes completados con fecha comprometida (mismo helper que los demás paneles) | Calidad del servicio que reciben los dadores |
| Documentos por revisar | Documentos `PENDING`, y cuántos esperan hace más de 48 h | Un transportista sin revisar no puede trabajar |
| Hasta la 1ª postulación | Mediana de horas entre la publicación y la primera postulación | Liquidez del marketplace |
| Postulaciones por carga, contraofertas | Promedios sobre la ventana | Competencia y negociación |
| Precio por km, duración, cancelación | Sobre viajes de la ventana | Salud operativa |
| Altas por mes | Usuarios nuevos por rol (sin admins) | Crecimiento |
| Usuarios activos | Publicaron, se postularon o tuvieron un viaje en 30 días | No hay `lastLogin`: se mide por acciones |
| Alertas | Cargas sin postulantes > 48 h; licencias, seguros y VTV vencidos o por vencer en 30 días | Cosas sobre las que el admin puede actuar ya |

**Precio pactado**: el de la postulación aceptada o, si no hubo postulación, el precio publicado de la carga. Es el mismo criterio que usan los paneles de transportista, dador y empresa.

**No se mide la comisión de CargoLink**: no existe un campo de fee en el modelo de datos. Sumarla requiere una migración.

## Monitoreo del sistema — `system-monitoring/`

Source: [`../backend/src/system-monitoring/`](../backend/src/system-monitoring/).

### Caídas: sesiones del proceso + heartbeat

Una app no puede registrar su propia caída: mientras está caída, no anota nada. Por eso se reconstruyen a posteriori:

- Al arrancar, el backend crea una fila en `uptime_sessions`.
- Cada minuto actualiza `lastSeenAt` (el heartbeat).
- Al apagarse en orden (SIGTERM de `docker compose` en un deploy) completa `endedAt`. Para eso `main.ts` llama a `app.enableShutdownHooks()`, y el entrypoint hace `exec node`, así el proceso recibe la señal.

El hueco entre el fin de una sesión y el arranque de la siguiente es tiempo caído:

- Si la sesión anterior tiene `endedAt` → **planificado** (deploy, reinicio manual).
- Si no lo tiene → **caída**: el proceso murió sin avisar (excepción no capturada, falta de memoria, Docker o VPS caído).

Precisión: en una caída, el proceso pudo seguir vivo hasta un minuto después del último latido, así que la duración es una cota superior (±1 min). Los huecos de menos de 5 s no se cuentan. El tiempo anterior al primer arranque registrado tampoco cuenta como caído.

### Tiempos de respuesta y errores: `request_metrics`

Un middleware mide cada request bajo `/api` (duración y código de respuesta) y lo acumula **en memoria** por minuto y endpoint. Cada minuto, el heartbeat guarda los minutos cerrados en `request_metrics`. Detalles de diseño:

- **Ruta, no URL**: se guarda `/api/loads/:id`, nunca `/api/loads/8f3a…`. La cardinalidad queda acotada y no se guardan ids ni query strings en una tabla de métricas. Los paths que no matchean ningún endpoint van todos a `(sin ruta)`.
- **Histograma, no requests sueltos**: cada fila guarda la cantidad de requests por bucket de latencia (10, 25, 50, 100, 250, 500 ms, 1, 2,5, 5 y 10 s, y "más lento"). Así p50, p95 y p99 se calculan para cualquier rango sumando buckets, igual que `histogram_quantile` de Prometheus. El error está acotado por el ancho del bucket.
- **4xx y 5xx por separado**: los 4xx suelen ser errores del cliente (validación, permisos); los 5xx indican que el servicio falla.
- **Preflights de CORS** (`OPTIONS`) no se miden.
- Si el proceso muere sin apagarse, se pierde como máximo el último minuto de métricas. Si la DB no responde, lo acumulado queda en memoria hasta el próximo latido exitoso.
- **Retención**: 35 días (el panel muestra hasta 30). La purga corre como mucho una vez por hora.

### Salud en vivo: `GET /api/admin/system/health`

| Señal | Qué mide |
|---|---|
| Base de datos | `SELECT 1` y su latencia |
| OSRM | Ruta corta fija contra `router.project-osrm.org`. Si cae, los viajes se completan sin km y las métricas de consumo dejan de sumar |
| SMTP | Que el servidor acepte la conexión TCP (no autentica ni manda nada). Sin SMTP los usuarios nuevos no reciben el mail de verificación |
| Errores 5xx | Últimos 15 minutos |
| Memoria | Heap usado sobre el límite de V8 |
| Event loop | p99 del retraso. Si sube, el server responde a los saltos aunque la CPU parezca libre |
| Chat en tiempo real | Conexiones de socket y usuarios conectados (solo este proceso) |
| Heartbeat | Latidos seguidos que fallaron (la DB no acepta escrituras) |

Los chequeos externos se cachean 1 minuto, porque el panel refresca cada 30 s y OSRM es un servicio público.

Con todo eso se arma el **semáforo** (`system-status.ts`):

- **Caído**: solo si la DB no responde.
- **Degradado**: más de 5 % de 5xx en 15 min, un servicio externo caído o lento (> 1,5 s), event loop con p99 > 200 ms, heap > 85 % o 2 o más latidos fallidos.
- **Operativo**: todo lo demás.

Cada motivo se muestra en el panel.

### Lo que este monitoreo no ve

Todo lo anterior se mide **desde adentro** del backend. Si se cae el VPS entero, Docker o el túnel de Cloudflare, el panel no puede mostrarlo en el momento: aparece después como una caída, cuando el backend vuelve a arrancar. Para enterarse en el momento hace falta un **chequeo externo** contra `https://plataforma.cargolink.com.ar` y `/api`, por ejemplo UptimeRobot (gratis) o Uptime Kuma, con aviso por mail. Es infraestructura, así que queda fuera de este módulo.

Tampoco se mide la **antigüedad del último backup**: el backup corre en el host (`~/backups/backup.sh`) y el contenedor del backend no lo ve. Conviene sumarlo al chequeo externo o al propio script de backup.

## Endpoints

| Método | Path | Descripción |
|---|---|---|
| GET | `/admin/metrics` | Métricas de uso de toda la plataforma |
| GET | `/admin/system/health` | Snapshot en vivo con semáforo, motivos y señales |
| GET | `/admin/system/metrics?range=24h\|7d\|30d` | Disponibilidad, caídas, latencias (overall, timeline, endpoints más lentos y con 5xx). Default `24h` |

Granularidad del timeline: 1 h para `24h`, 6 h para `7d` y 1 día para `30d`. Los intervalos sin tráfico vuelven en cero, porque un hueco en cero suele ser justamente una caída.
