# CargoLink Mobile (iOS + Android)

App React Native con Expo SDK 57 (React 19.2 / RN 0.86). Comparte backend con el
frontend web: mismo API NestJS, mismos roles (`CARGO_GENERATOR` / `TRANSPORTER`).

## Requisitos

| Herramienta | Versión | Nota |
|---|---|---|
| Node | `>= 22.13` | RN 0.86 lo exige. Con 22.11 npm tira `EBADENGINE`. |
| Xcode | 16+ | Sólo para el simulador de iOS / build nativo. |
| Watchman | opcional | Mejora el file watching de Metro en macOS. |

## Arrancar

```bash
cd mobile
npm install
npm start          # Metro + QR para Expo Go
npm run ios        # abre el simulador de iOS (requiere Xcode)
npm run android    # abre el emulador de Android
```

El backend tiene que estar corriendo aparte (`docker compose up -d` en la raíz).

### Cómo encuentra la app al backend

No hay que hardcodear ninguna IP. `src/config/env.ts` resuelve la URL en este orden:

1. `EXPO_PUBLIC_API_URL` del `.env`, si está seteada (para apuntar a Cloud Run).
2. `extra.apiUrl` de `app.config.js`.
3. **La IP de la máquina que corre Metro**, en el puerto `3001`. Esto es lo que
   hace que funcione en un dispositivo físico: `localhost` desde el celular
   apuntaría al celular mismo, así que reusamos la IP de LAN por la que el
   teléfono ya se conectó a Metro.
4. `http://localhost:3001/api` como último recurso.

## Comandos

```bash
npm test           # jest (20 suites, 129 tests)
npm run typecheck  # tsc --noEmit
npm run doctor     # expo-doctor: chequeos de config y peer deps nativas
npm run prebuild   # genera ios/ y android/ (ambos gitignoreados)
```

## Assets

Los iconos y el splash se generan por código, no son binarios editados a mano:

```bash
node scripts/generate-assets.mjs
```

El script dibuja la marca con la paleta de `frontend/tailwind.config.ts`
(`primary-600 #2563EB`, `accent-400 #F59E0B`) y escribe los PNG en `assets/`.
Para cambiar el logo, editar `drawTruck()` y volver a correrlo.

## Mapas

`TrackingScreen` usa `PROVIDER_DEFAULT`: Apple Maps en iOS (sin credenciales) y
Google Maps en Android, que **sí** necesita `GOOGLE_MAPS_API_KEY_ANDROID` en el
`.env` — sin esa key el mapa se ve en blanco.

## Pendientes conocidos

- **Chat por polling.** `ChatScreen` refetchea cada 3s en vez de usar el gateway
  de WebSockets (`backend/src/messages/messages.gateway.ts`, namespace `/chat`).
  `socket.io-client` ya está instalado pero sin usar.
- **Push notifications sin proyecto EAS.** `registerForPushNotifications()`
  devuelve `null` hasta que se corra `eas init` y exista un `projectId`.
- **Testing Library pineada en v13.** La v14 volvió `render()` asíncrono; migrar
  requiere `await` en los 12 archivos de test de pantallas.
- **Paridad con el web.** Las mejoras de cargas mergeadas en `develop`
  (insights de postulaciones, presupuesto máximo, industria, zona del carrier)
  todavía no están reflejadas en las pantallas mobile.
