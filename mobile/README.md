# CargoLink Mobile (iOS + Android)

App React Native con Expo SDK 57 (React 19.2 / RN 0.86). Comparte backend con el
frontend web: mismo API NestJS, mismos roles (`CARGO_GENERATOR` / `TRANSPORTER`).

## Requisitos

| Herramienta | Versión | Nota |
|---|---|---|
| Node | `>= 22.13` | RN 0.86 lo exige. Con 22.11 npm tira `EBADENGINE`. |
| Xcode | 16+ | Sólo para el simulador de iOS / build nativo. |
| JDK | 17 | Sólo para Android. Gradle 9 con JDK 11 ni arranca. |
| Android SDK | API 36 | Sólo para Android. No hace falta Android Studio — ver § "Correr en un Android físico". |
| Watchman | opcional | Mejora el file watching de Metro en macOS. |

## Arrancar

```bash
cd mobile
npm install
npm start          # Metro
npm run ios        # build nativo + simulador de iOS (requiere Xcode)
npm run android    # build nativo + emulador o teléfono conectado
```

`npm start` solo no alcanza para levantar la app: el QR apunta a Expo Go, que no
soporta este proyecto (ver § "Correr en un iPhone físico"). Hay que buildear
nativo al menos una vez por dispositivo; después Metro recarga el JS solo.

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
npm test           # jest (25 suites, 283 tests)
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

## Correr en un Android físico

Igual que en iOS, **Expo Go no sirve** (SDK 57 contra un cliente que llega a 54).
El camino es el build nativo por cable. La buena noticia es que en Android no hay
firma de por medio: no hace falta cuenta de desarrollador, el certificado de
debug lo genera Gradle solo y no vence.

### Toolchain (una sola vez)

**No hace falta instalar Android Studio.** Con las command-line tools alcanza y
son ~1 GB en vez de ~12 GB:

```bash
brew install openjdk@17 android-commandlinetools android-platform-tools

export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Las dos `export` conviene dejarlas en el `~/.zshrc`: `openjdk@17` es **keg-only**
(brew no lo linkea para no pisar otros JDK), así que sin `JAVA_HOME` Gradle toma
el `java` del PATH — si ese es el 11, el build muere en el arranque.

### Preparar el teléfono

1. **Settings → About phone** → tocar 7 veces **Build number** para habilitar las
   opciones de desarrollador.
2. **Settings → System → Developer options** → activar **USB debugging**.
3. Conectar por cable y aceptar el diálogo *"Allow USB debugging?"* que aparece
   en el teléfono. Confirmar que se ve:

```bash
adb devices        # tiene que listar el serial con estado `device`, no `unauthorized`
```

### Buildear

```bash
npx expo run:android --device
```

La primera corrida se toma varios minutos: baja Gradle 9.3 y las dependencias
nativas (~1 GB en `~/.gradle`). Las siguientes son incrementales.

### Cómo llega la app al backend

Igual que en iOS: `src/config/env.ts` deduce la IP de LAN de la máquina que corre
Metro, así que **teléfono y Mac tienen que estar en la misma red Wi-Fi**.

Si no lo están (o la red aísla clientes, típico de Wi-Fi de facultad), el cable
alcanza: `adb reverse` mapea un puerto de la Mac dentro del teléfono.

```bash
adb reverse tcp:3001 tcp:3001      # backend
EXPO_PUBLIC_API_URL=http://localhost:3001/api npx expo run:android --device
```

Hay que repetir el `adb reverse` cada vez que se desconecta el cable.

**Sobre `http://`**: Android bloquea tráfico en claro desde API 28, pero el
`AndroidManifest.xml` del *debug* que genera el prebuild trae
`usesCleartextTraffic="true"`, así que el backend local funciona sin tocar nada.
Un build de **release** sí lo bloquea — en prod no importa porque Cloud Run es
https.

### Notificaciones

Android 13+ pide `POST_NOTIFICATIONS` en runtime, y el plugin de
`expo-notifications` **no** declara ese permiso solo: está agregado a mano en
`android.permissions` de `app.config.js`. Si se saca, `requestPermissionsAsync()`
devuelve denegado sin mostrar diálogo y no se ve ninguna notificación.

Las push remotas siguen dependiendo de `EAS_PROJECT_ID` (ver § "Notificaciones
push"), pero acá no hay límite de cuenta gratuita como en iOS: con el projectId
puesto, un build de debug en Android las recibe.

## Mapas

`TrackingScreen` dibuja el mapa con **MapLibre** (`@maplibre/maplibre-react-native`)
sobre tiles de **OpenStreetMap** servidos por OpenFreeMap. **No hace falta
ninguna API key**, ni en iOS ni en Android.

Antes esto era `react-native-maps` con `PROVIDER_DEFAULT`, que resolvía iOS con
Apple Maps pero en Android exigía una key de Google Maps facturable: sin ella el
mapa quedaba gris. Poner tiles de OSM encima tampoco alcanzaba, porque el mapa
base lo renderiza el SDK de Google y es lo que falla sin key. Cambiar de motor
era la única salida real, y de paso alinea al mobile con el resto del stack: el
web ya usa Leaflet + OSM y el ruteo va contra OSRM (`src/services/routing.ts`).

Para usar otro proveedor de tiles (MapTiler, Stadia, un style propio) alcanza con
`EXPO_PUBLIC_MAP_STYLE_URL` en el `.env`; no hay que tocar código.

Diferencias de API respecto de `react-native-maps`, por si tocás la pantalla:

| react-native-maps | MapLibre |
|---|---|
| `<MapView>` | `<Map mapStyle={...}>` |
| `initialRegion` + `mapRef.fitToCoordinates(coords)` | `<Camera>` + `cameraRef.fitBounds([w, s, e, n])` (ver `src/lib/bounds.ts`) |
| `<Marker pinColor="red">` | `<Marker lngLat={[lng, lat]}>` con una vista propia adentro |
| `<Polyline coordinates>` | `<GeoJSONSource>` + `<Layer type="line">` |

Ojo con el orden de las coordenadas: MapLibre usa `[longitud, latitud]` (como
GeoJSON), al revés de `{ latitude, longitude }` que usa el resto del código.

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
- **Sin marcadores con etiqueta en el mapa.** Los pines de MapLibre son vistas
  propias (`MapPin` en `TrackingScreen`), y la migración no reprodujo los
  callouts con título/dirección que traía `react-native-maps`. La info del viaje
  está en la lista de abajo; si se quiere el popup hay que armarlo con
  `<Callout>` o una `ViewAnnotation`.
- **Tiles de OpenFreeMap sin contrato.** El style por defecto es un servicio
  gratuito y sin cuota, pero tampoco tiene SLA. Si algún día se cae o mete
  límites, se apunta `EXPO_PUBLIC_MAP_STYLE_URL` a otro proveedor y listo.
