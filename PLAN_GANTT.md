# CargoLink - Plan de Desarrollo (Diagrama de Gantt)

**Inicio del proyecto:** 1 de abril de 2026
**Hito MVP:** 8 de junio de 2026
**Fin del proyecto:** 1ra semana de noviembre de 2026
**Duración total:** ~31 semanas

---

# ETAPA 1: PRE-MVP (1 abril - 8 junio | Semanas 1-10)

> **Alcance del MVP:** Backend funcional + Frontend Web simple de prueba.
> **No incluye:** App Mobile ni Mensajería en tiempo real.

---

## Fase 0: Concepción y Relevamiento (Semanas 1-2)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 0.1 | Definición de la idea del proyecto y problemática a resolver | 3 días | - |
| 0.2 | Investigación del dominio (transporte de cargas por carretera) | 3 días | 0.1 |
| 0.3 | Identificación de actores y casos de uso principales | 3 días | 0.2 |
| 0.4 | Relevamiento de requerimientos funcionales | 3 días | 0.3 |
| 0.5 | Relevamiento de requerimientos no funcionales | 2 días | 0.3 |
| 0.6 | Análisis de viabilidad y alcance del proyecto | 2 días | 0.4, 0.5 |

---

## Fase 1: Planificación y Diseño (Semanas 2-4)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 1.1 | Definición de roles de usuario (Transportista, Generador de carga, Admin) | 2 días | 0.4, 0.6 |
| 1.2 | Diseño de arquitectura del sistema (Backend + Frontend Web) | 1 semana | 0.6, 1.1 |
| 1.3 | Diseño del modelo de datos (Usuarios, Cargas, Viajes, Calificaciones) | 1 semana | 1.1, 1.2 |
| 1.4 | Diseño de wireframes del Frontend Web (pantallas principales) | 1 semana | 1.1, 1.2, 1.3 |
| 1.5 | Definición del stack tecnológico | 3 días | 1.2 |
| 1.6 | Configuración del repositorio y estructura del proyecto | 2 días | 1.5 |

---

## Fase 2: Configuración del Entorno (Semanas 4-5)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 2.1 | Inicialización del proyecto Backend (NestJS, Prisma, PostgreSQL) | 3 días | 1.5, 1.6 |
| 2.2 | Inicialización del proyecto Frontend Web (Next.js, Tailwind CSS) | 2 días | 1.4, 1.6 |
| 2.3 | Configuración de base de datos y migraciones iniciales (Prisma schema) | 3 días | 1.3, 2.1 |
| 2.4 | Configuración de variables de entorno y scripts de desarrollo | 1 día | 2.1, 2.2 |

---

## Fase 3: Autenticación y Usuarios - MVP (Semanas 5-6)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 3.1 | API de registro y login con JWT (Backend) | 4 días | 2.3 |
| 3.2 | API de gestión de perfiles y roles (SHIPPER/CARRIER/ADMIN) | 3 días | 3.1 |
| 3.3 | Guards y decoradores de autorización por rol | 2 días | 3.1 |
| 3.4 | Pantallas de Login y Registro (Frontend Web) | 4 días | 2.2, 3.1 |
| 3.5 | Funcionalidad de recuperación de contraseña | 2 días | 3.1 |
| 3.6 | Store de autenticación con Zustand (Web) | 2 días | 3.4 |

---

## Fase 4: Gestión de Cargas - MVP (Semanas 6-8)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 4.1 | API CRUD de cargas (crear, listar, editar, eliminar) | 1 semana | 3.2, 3.3 |
| 4.2 | Filtros y búsqueda de cargas disponibles | 3 días | 4.1 |
| 4.3 | Gestión de estados de carga (PUBLISHED → ASSIGNED → IN_TRANSIT → DELIVERED/CANCELLED) | 3 días | 4.1 |
| 4.4 | Pantallas de creación y listado de cargas (Frontend Web) | 4 días | 3.6, 4.1 |
| 4.5 | Pantalla de detalle y edición de carga (Frontend Web) | 3 días | 4.4 |

---

## Fase 5: Viajes y Tracking básico - MVP (Semanas 8-9)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 5.1 | API de viajes (aceptar carga, iniciar, completar, cancelar) | 4 días | 4.3 |
| 5.2 | Ciclo de vida del viaje (PENDING → ACCEPTED → IN_PROGRESS → COMPLETED) | 3 días | 5.1 |
| 5.3 | Dashboard del transportista - viajes activos (Frontend Web) | 3 días | 3.6, 5.1 |
| 5.4 | Dashboard del generador de carga - seguimiento de entregas (Frontend Web) | 3 días | 3.6, 5.1 |
| 5.5 | Dashboard de administrador básico (Frontend Web) | 3 días | 3.3, 5.1 |

---

## Fase 6: Métricas y Reportes - MVP (Semanas 9-10)

> Puede iniciarse en paralelo con el final de Fase 5 una vez que 5.2 esté completo.

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 6.1 | API de registro de métricas por cliente (cargas publicadas, viajes realizados, calificación promedio, etc.) | 4 días | 5.2 |
| 6.2 | API de métricas del sistema (totales de cargas, viajes, usuarios activos, tasas de completado) | 3 días | 6.1 |
| 6.3 | Pantalla de métricas por cliente - perfil con estadísticas (Frontend Web) | 4 días | 6.1 |
| 6.4 | Dashboard de métricas generales del sistema para Admin (Frontend Web) | 4 días | 5.5, 6.2 |

---

## Fase 7: Testing y estabilización del MVP (Semanas 10-11)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| 7.1 | Tests básicos del Backend (endpoints principales) | 3 días | 6.2 |
| 7.2 | Testing funcional del Frontend Web (flujos críticos) | 3 días | 6.4 |
| 7.3 | Corrección de bugs y ajustes generales | 4 días | 7.1, 7.2 |
| 7.4 | Seed de datos de demostración para el MVP | 2 días | 7.3 |
| 7.5 | Documentación básica de la API (Swagger) | 2 días | 7.3 |

---

## ⬥ HITO: MVP - 8 de junio de 2026

> Backend funcional + Frontend Web simple de prueba
> Módulos: Auth, Cargas, Viajes, Métricas, Admin básico
> Sin Mobile | Sin Mensajería

---

# ETAPA 2: EVOLUCIONES POST-MVP (9 junio - 1ra semana noviembre | Semanas 11-31)

---

## Evolución 1: Tracking GPS en tiempo real (Semanas 11-13)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| E1.1 | API de tracking GPS (almacenar y consultar coordenadas) | 4 días | MVP |
| E1.2 | Integración de mapas con Leaflet (Frontend Web) | 4 días | E1.1 |
| E1.3 | Pantalla de tracking en tiempo real con mapa (Web) | 1 semana | E1.2 |
| E1.4 | Mejoras en dashboards con visualización geográfica | 3 días | E1.3 |

---

## Evolución 2: Mensajería en Tiempo Real (Semanas 13-16)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| E2.1 | WebSocket Gateway con Socket.IO (Backend) | 4 días | MVP |
| E2.2 | API de historial de conversaciones y mensajes no leídos | 3 días | E2.1 |
| E2.3 | Guards de autorización para chat (solo participantes del viaje) | 2 días | 5.2, E2.1 |
| E2.4 | Interfaz de chat - lista de conversaciones y ventana de mensajes (Frontend Web) | 1 semana | E2.2, E2.3 |
| E2.5 | Indicadores de mensajes no leídos y notificaciones | 3 días | E2.4 |

---

## Evolución 3: Calificaciones y Reseñas (Semanas 16-17)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| E3.1 | API de calificaciones y reseñas post-viaje | 3 días | MVP |
| E3.2 | Interfaz de calificación (Frontend Web) | 3 días | E3.1 |
| E3.3 | Visualización de reputación de usuarios | 3 días | E3.2 |

---

## Evolución 4: Aplicación Mobile (Semanas 17-23)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| E4.1 | Inicialización del proyecto Mobile (React Native, Expo) | 3 días | MVP |
| E4.2 | Pantallas de Login y Registro (Mobile) | 4 días | E4.1 |
| E4.3 | Store de autenticación con Zustand (Mobile) | 2 días | E4.2 |
| E4.4 | Pantallas de gestión de cargas (Mobile) | 1 semana | E4.3 |
| E4.5 | Pantallas de viajes y tracking con React Native Maps | 1 semana | E1.1, E4.4 |
| E4.6 | Chat y mensajería en App Mobile | 1 semana | E2.5, E4.5 |
| E4.7 | Notificaciones push (expo-notifications) | 4 días | E4.6 |
| E4.8 | Calificaciones en App Mobile | 3 días | E3.1, E4.5 |

---

## Evolución 5: Mejoras de UI/UX y Panel Admin completo (Semanas 23-26)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| E5.1 | Rediseño y mejoras de UI/UX del Frontend Web | 1 semana | E1.4, E2.5, E3.3 |
| E5.2 | Panel admin completo: gestión de usuarios (activar/desactivar) | 4 días | E5.1 |
| E5.3 | Panel admin: monitoreo de cargas, viajes y métricas | 4 días | E5.2 |
| E5.4 | Mejoras de navegación y responsive design | 4 días | E5.1 |

---

## Evolución 6: Testing integral y QA (Semanas 26-29)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| E6.1 | Tests unitarios del Backend (servicios y controllers) | 1 semana | E5.3 |
| E6.2 | Tests de integración de APIs (todos los endpoints) | 4 días | E6.1 |
| E6.3 | Testing funcional del Frontend Web (todos los flujos) | 4 días | E5.4, E6.1 |
| E6.4 | Testing de la App Mobile (flujos principales) | 4 días | E4.7, E4.8 |
| E6.5 | Corrección de bugs y ajustes finales | 1 semana | E6.2, E6.3, E6.4 |

---

## Evolución 7: Documentación y Entrega Final (Semanas 29-31)

| # | Tarea | Duración | Dependencias |
|---|-------|----------|--------------|
| E7.1 | Documentación completa de la API (Swagger / OpenAPI) | 3 días | E6.5 |
| E7.2 | Documentación técnica del proyecto (arquitectura, despliegue) | 3 días | E6.5 |
| E7.3 | Configuración de entorno de producción / despliegue | 4 días | E7.1, E7.2 |
| E7.4 | Pruebas finales en entorno de producción | 3 días | E7.3 |
| E7.5 | Preparación de presentación final del proyecto | 4 días | E7.4 |
| E7.6 | Entrega final y defensa del proyecto | 2 días | E7.5 |

---

# Resumen General

| Etapa | Fase | Semanas | Fechas |
|-------|------|---------|--------|
| **PRE-MVP** | Fase 0: Concepción y Relevamiento | 1 - 2 | 1 abr - 14 abr |
| | Fase 1: Planificación y Diseño | 2 - 4 | 14 abr - 28 abr |
| | Fase 2: Configuración del Entorno | 4 - 5 | 28 abr - 5 may |
| | Fase 3: Autenticación y Usuarios | 5 - 7 | 5 may - 19 may |
| | Fase 4: Gestión de Cargas | 7 - 9 | 19 may - 2 jun |
| | Fase 5: Viajes y Dashboards básicos | 8 - 9 | 26 may - 2 jun |
| | Fase 6: Métricas y Reportes *(paralelo con sem 9)* | 9 - 10 | 2 jun - 9 jun |
| | Fase 7: Testing y estabilización MVP | 10 - 11 | 3 jun - 8 jun |
| | **⬥ HITO: MVP** | **11** | **8 de junio** |
| **POST-MVP** | Evolución 1: Tracking GPS en tiempo real | 11 - 13 | 9 jun - 30 jun |
| | Evolución 2: Mensajería en Tiempo Real | 13 - 16 | 30 jun - 21 jul |
| | Evolución 3: Calificaciones y Reseñas | 16 - 17 | 21 jul - 28 jul |
| | Evolución 4: Aplicación Mobile | 17 - 23 | 28 jul - 8 sep |
| | Evolución 5: Mejoras UI/UX y Admin | 23 - 26 | 8 sep - 29 sep |
| | Evolución 6: Testing integral y QA | 26 - 29 | 29 sep - 20 oct |
| | Evolución 7: Documentación y Entrega | 29 - 31 | 20 oct - 3 nov |
| | **⬥ FIN DEL PROYECTO** | **31** | **1ra semana noviembre** |

---

# Análisis de Dependencias y Riesgos de Planificación

## Cambios de dependencias aplicados

| # | Tarea | Cambio | Motivo |
|---|-------|--------|--------|
| 1.1 | Roles de usuario | Agregada dep: `0.6` | Los roles deben sobrevivir el análisis de viabilidad antes de definirse |
| 1.2 | Arquitectura del sistema | Agregada dep: `1.1` | La arquitectura multi-rol (guards, JWT claims) depende de los roles definidos |
| 1.3 | Modelo de datos | Agregada dep: `1.2` | El esquema de entidades depende de las decisiones arquitectónicas (monolito vs módulos) |
| 1.4 | Wireframes Frontend | Agregadas deps: `1.2, 1.3` | Los wireframes deben reflejar entidades del modelo y restricciones arquitectónicas |
| 2.2 | Init Frontend Web | Cambiada dep: `1.6` → `1.4, 1.6` | La estructura de carpetas y rutas de Next.js debe basarse en los wireframes finalizados |
| 4.1 | API CRUD de cargas | Agregada dep: `3.3` | Los endpoints de cargas requieren guards por rol desde el inicio (SHIPPER crea, CARRIER consulta) |
| 4.4 | Pantallas de cargas (Web) | Agregada dep: `3.6` | Las pantallas necesitan el auth store (Zustand) para obtener la identidad del usuario logueado |
| 5.3 | Dashboard transportista | Agregada dep: `3.6` | Pantalla autenticada: requiere el store de sesión para determinar el usuario activo |
| 5.4 | Dashboard generador de carga | Agregada dep: `3.6` | Ídem 5.3 |
| 7.1 | Tests Backend MVP | Cambiada dep: `6.4` → `6.2` | Los tests del backend no deben bloquearse por el dashboard frontend (6.4); dependen del último endpoint (6.2) |
| E2.3 | Guards de autorización chat | Agregada dep: `5.2` | El guard valida "solo participantes del viaje": requiere el ciclo de vida del viaje estable |
| E2.4 | Interfaz de chat (Web) | Agregada dep: `E2.3` | La UI de chat no debe desplegarse sin el guard de autorización activo |
| E4.5 | Pantallas de tracking (Mobile) | Agregada dep: `E1.1` | Las pantallas usan React Native Maps con coordenadas GPS: requiere la API de tracking (E1.1) |
| E5.1 | Rediseño UI/UX | Agregada dep: `E1.4` | El rediseño debe incorporar los dashboards con mapas geográficos incorporados en E1.4 |
| E6.3 | Testing Frontend Web | Agregada dep: `E5.4` | Los tests funcionales del frontend requieren que navegación y responsive estén completos |
| E6.4 | Testing App Mobile | Agregada dep: `E4.7` | Las pruebas de la app deben incluir el flujo de notificaciones push (E4.7) |
| E7.3 | Config entorno de producción | Agregada dep: `E7.2` | El despliegue debe guiarse por la documentación técnica de arquitectura (E7.2) |

---

## Riesgos de planificación identificados

| Riesgo | Fases afectadas | Descripción |
|--------|----------------|-------------|
| **Compresión crítica pre-MVP** | Fases 5, 6 y 7 | Las fases 5-7 deben ejecutarse en paralelo parcial para alcanzar el 8 de junio. Fase 6 puede iniciar cuando 5.2 esté listo (~día 3 de Fase 5). Fase 7 backend puede iniciar cuando 6.2 esté listo, independientemente de 6.4. Sin este paralelismo el MVP se retrasa ~1 semana. |
| **Evolución 3 es cuello de botella** | E3, E4, E5 | E3.3 bloquea E5.1 (rediseño) y E3.1 bloquea E4.8 (calificaciones mobile). Cualquier demora en E3 impacta dos ramas en paralelo. |
| **E4.5 tiene doble dependencia entre evoluciones** | E1, E4 | E4.5 (tracking mobile) depende tanto de E4.4 (pantallas mobile anteriores) como de E1.1 (API GPS de Evolución 1). Si E1.1 presenta problemas al integrarse con React Native Maps, no hay buffer antes de E4.6. |
| **E6.4 mobile testing es la tarea más expuesta** | E4, E6 | E6.4 depende de E4.7 (push notifications) y E4.8 (ratings), ambas en el tramo final de Evolución 4. Si cualquiera de las dos se demora, E6.4 bloquea E6.5 y retarda toda la entrega final. |
