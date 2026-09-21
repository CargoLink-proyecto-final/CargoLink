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

1. `EXPO_PUBLIC_API_URL` del `.env`, si está seteada (para apuntar al VPS).
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

Las **remotas** (app cerrada) necesitan dos cosas que todavía no existen:

1. **Un projectId de EAS.** `eas init` no puede escribir en un `app.config.js`
   dinámico, así que el id entra por env:

   ```bash
   npx eas-cli login
   npx eas-cli init          # imprime el projectId
   echo "EAS_PROJECT_ID=<el-id>" >> .env
   ```

   Sin esa variable `registerForPushNotifications()` devuelve `null` y loguea un
   warning, en vez de romper.

2. **Soporte en el backend.** Hoy no hay dónde guardar el token (no existe
   columna en `User`) ni desde dónde emitir pushes. El hook ya pide el token y lo
   loguea; falta el endpoint que lo persista y el sender contra la Expo Push API.

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
Hay que vaciar el `<dict>` de ese archivo. No se pierde nada verificable: las
push remotas ya están bloqueadas por lo de arriba. **Ojo: `ios/` está
gitignoreado y `expo prebuild` regenera el entitlements — hay que repetirlo.**

La primera instalación también pide activar **Settings → Privacy & Security →
Developer Mode** en el iPhone. Esa opción **no aparece** hasta que la Mac intenta
instalar una app de desarrollo por primera vez.

## Mapas

`TrackingScreen` usa `PROVIDER_DEFAULT`: Apple Maps en iOS (sin credenciales) y
Google Maps en Android, que **sí** necesita `GOOGLE_MAPS_API_KEY_ANDROID` en el
`.env` — sin esa key el mapa se ve en blanco.

## Builds en la nube y TestFlight (EAS)

`eas.json` define los perfiles de build. Son la única forma de que la app salga
de esta Mac: iOS sólo instala apps firmadas que distribuye Apple, así que el
camino es **EAS Build → App Store Connect → TestFlight**.

| Perfil | Distribución | Backend que queda grabado | Para qué |
|---|---|---|---|
| `simulator` | interna | `https://dev.cargolink.com.ar/api` | Build para el simulador de iOS, sin firmar con cuenta Apple. |
| `preview` | interna | `https://dev.cargolink.com.ar/api` | Ad hoc: se instala en iPhones registrados con `eas device:create`. En Android sale un `.apk` instalable. |
| `production` | store | `https://plataforma.cargolink.com.ar/api` | Lo que se sube a TestFlight y a la App Store. En Android, `.aab`. |

La URL del API **se congela en el build**: no se puede cambiar después sin
recompilar. Por eso hay un perfil por entorno en vez de una sola build
configurable.

### Antes del primer build

```bash
cd mobile
npx eas-cli login
npx eas-cli init          # crea el proyecto en Expo e imprime el projectId
```

1. **`EAS_PROJECT_ID` va en `eas.json`, no en el `.env`.** El `.env` está
   gitignoreado y EAS sólo sube lo que está commiteado, así que en los servidores
   de build esa variable no existiría y `getExpoPushTokenAsync()` se quedaría sin
   id. Después de `eas init`, agregá el id al `env` de cada perfil.
2. **El bundle identifier tiene que ser tuyo.** `com.cargolink.app` (en
   `app.config.js`) está registrado por otra cuenta de Apple; con la cuenta paga
   hay que elegir uno libre y registrarlo en App Store Connect.
3. **Cuenta de Apple Developer paga** (99 USD al año). La gratuita no sirve acá:
   no soporta push remotas y sus certificados vencen a los 7 días.

### Compilar y subir

```bash
npx eas-cli build -p ios --profile production
npx eas-cli submit -p ios --latest     # deja el build en TestFlight
```

`requireCommit: true` en `eas.json` hace que EAS rechace el build si hay cambios
sin commitear: lo que se compila es siempre un commit identificable. Y como
`ios/` y `android/` están gitignoreados (workflow CNG), EAS corre `expo prebuild`
del lado del servidor a partir de `app.config.js`.

`appVersionSource: "remote"` con `autoIncrement` en `production` deja que EAS
lleve el número de build. Apple rechaza dos subidas con el mismo número, y así
no hay que tocarlo a mano en cada release.

El perfil `production` no declara `channel` porque el proyecto todavía no usa
`expo-updates`. Cuando se agregue EAS Update, ahí va el canal.

### Límites y costos

El plan gratuito de EAS da **15 builds de iOS y 15 de Android por mes**, con cola
de baja prioridad y un tope de 45 minutos por build. Alcanza de sobra si se
compila en la nube sólo para publicar: el desarrollo diario sigue con
`npx expo run:ios`, que corre en la Mac y no consume cuota.

Cada build de TestFlight **caduca a los 90 días**.

### Enviar a la App Store

TestFlight interno (hasta 100 miembros del equipo) no necesita revisión de Apple.
Para testers externos o para publicar hace falta pasar revisión, y hoy faltan
tres cosas del lado del producto:

- **Borrar la cuenta desde la app.** Apple lo exige a toda app con registro de
  usuarios; el backend no expone hoy ningún endpoint que borre la cuenta.
- **Una política de privacidad pública**, con URL propia.
- **Un usuario de prueba con el email ya verificado** para los revisores.

Además, declarar `ITSAppUsesNonExemptEncryption: false` evita la pregunta de
cifrado en cada subida.

## Pendientes conocidos

- **Push remotas incompletas.** Falta el `EAS_PROJECT_ID` y, sobre todo, el
  soporte del backend (persistir el token + emitir). Ver § "Notificaciones push".
- **El publicador no puede resolver postulaciones.** El transportista se postula,
  contra-oferta y se retira desde `LoadDetailScreen`, pero del otro lado
  `postulationsApi.accept` y `counterOffer` no los llama ninguna pantalla: aceptar
  una postulación sólo se puede desde el web.
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
