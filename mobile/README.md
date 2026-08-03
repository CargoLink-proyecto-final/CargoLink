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
npm test           # jest (24 suites, 274 tests)
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

## Chat en tiempo real

`ChatScreen` y `ChatListScreen` se conectan al gateway de WebSockets del backend
(`backend/src/messages/messages.gateway.ts`, namespace `/chat`) vía
`src/services/socket.ts`.

- Las conversaciones son **por viaje** (`tripId`), no entre usuarios sueltos.
- El gateway autentica con `handshake.query.userId` y mete al socket en una room
  por cada viaje del usuario — el cliente sólo escucha `newMessage`.
- Si el socket no conecta, `ChatScreen` cae a polling cada 3s y muestra un aviso.
  El `POST /messages/trip/:tripId` no dispara broadcast, así que ese camino sólo
  se usa como fallback.
- El listener global (`src/hooks/useMessageNotifications.ts`) dispara una
  notificación local por los mensajes que llegan fuera de la conversación abierta.

## Notificaciones push

Las **locales** funcionan hoy sin configuración: las emite el propio dispositivo
cuando llega un mensaje por el socket.

Las **remotas** (app cerrada) ya están implementadas de punta a punta — el hook
registra el token en `PUT /users/me/push-token` y el backend emite contra la
Expo Push API cuando llega un mensaje. Sólo emite si el destinatario **no** tiene
el socket de chat conectado, para no duplicar la notificación local.

Falta una sola cosa para que funcionen: **el projectId de EAS**. `eas init` no
puede escribir en un `app.config.js` dinámico, así que el id entra por env:

```bash
npx eas-cli login
npx eas-cli init          # imprime el projectId
echo "EAS_PROJECT_ID=<el-id>" >> .env
```

Sin esa variable `registerForPushNotifications()` devuelve `null`, no se registra
ningún token y la app sigue andando con las notificaciones locales.

## Correr en un iPhone físico

**Expo Go no sirve para este proyecto.** La app está en SDK 57 y la App Store
publica Expo Go **54.0.2** (sept-2025) en todas las regiones, que sólo llega a
SDK 54. El teléfono muestra "Project is incompatible with this version of Expo
Go" y no hay actualización que instalar. La alternativa es el build nativo:

```bash
npx expo run:ios --device
```

Requiere un Apple ID cargado en Xcode (Settings → Accounts). Con cuenta gratuita
("Personal Team") el certificado dura **7 días**; después hay que reinstalar.

**Las cuentas gratuitas no soportan la capability Push Notifications**, y el
prebuild deja `aps-environment` en `ios/CargoLink/CargoLink.entitlements` porque
lo agrega el plugin `expo-notifications`. Con eso puesto, Xcode falla con
"Personal development teams … do not support the Push Notifications capability".
Hay que vaciar el `<dict>` de ese archivo. El costo es real desde que las push
remotas están implementadas: un build firmado con cuenta gratuita no las va a
recibir, sólo las locales. Para probarlas hace falta una cuenta de Apple
Developer paga. **Ojo: `ios/` está gitignoreado y `expo prebuild` regenera el
entitlements — hay que repetirlo.**

La primera instalación también pide activar **Settings → Privacy & Security →
Developer Mode** en el iPhone. Esa opción **no aparece** hasta que la Mac intenta
instalar una app de desarrollo por primera vez.

## Mapas

`TrackingScreen` usa `PROVIDER_DEFAULT`: Apple Maps en iOS (sin credenciales) y
Google Maps en Android, que **sí** necesita `GOOGLE_MAPS_API_KEY_ANDROID` en el
`.env` — sin esa key el mapa se ve en blanco.

## Pendientes conocidos

- **Push remotas sin `EAS_PROJECT_ID`.** El código está completo de punta a
  punta; falta correr `eas init`. Ver § "Notificaciones push".
- **Un solo dispositivo por cuenta.** El token de Expo se guarda en una columna
  de `User`: el último teléfono que se registra desplaza al anterior. Varios
  dispositivos a la vez necesitarían una tabla aparte.
- **Calificación unidireccional.** Sólo el publicador califica al transportista;
  el backend lo restringe a propósito (`@Roles('CARGO_GENERATOR')` + chequeo de
  ownership en `ratings.service.ts`). El sentido inverso requiere cambiar el
  contrato de la API y afecta también al web.
- **Direcciones a mano.** `CreateLoadScreen` pide lat/lng tipeadas; el web
  geocodifica con Nominatim y tiene un picker sobre el mapa.
- **Testing Library pineada en v13.** La v14 volvió `render()` asíncrono; migrar
  requiere `await` en los archivos de test de pantallas.
- **Tipos de carga duplicados.** `src/constants/cargo.ts` es copia manual de la
  lista del web: si se agrega un tipo allá, hay que agregarlo acá.
