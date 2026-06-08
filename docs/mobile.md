# Mobile (Expo / React Native)

App iOS + Android construida con Expo (managed workflow). Source en [`../mobile/`](../mobile/).

## Stack y versiones

| Pieza | Versión |
|---|---|
| Expo SDK | 50 |
| React Native | 0.73.2 |
| React | 18.2 |
| TypeScript | 5.3 |
| React Navigation | 6.1 (native-stack + bottom-tabs) |
| Zustand | 4.5 |
| AsyncStorage | 1.21 |
| Axios | 1.6 |
| Socket.IO Client | 4.7 |
| react-native-maps | 1.10 (Google Maps) |
| expo-location | 16.5 |
| expo-notifications | 0.27 |
| expo-device | 5.9 |
| React Hook Form | 7.49 |
| date-fns | 3.2 |
| `@expo/vector-icons` | 14.0 (Ionicons) |

`package.json` completo en [`../mobile/package.json`](../mobile/package.json).

## Estructura

```
mobile/
├── App.tsx                          # entry point: hydrate auth + AppNavigator
├── app.json                         # config Expo (bundle id, perms, plugins)
├── package.json
├── tsconfig.json
├── assets/
└── src/
    ├── navigation/
    │   └── AppNavigator.tsx         # stack auth vs main + bottom-tabs por rol
    ├── screens/
    │   ├── auth/
    │   │   ├── LoginScreen.tsx
    │   │   ├── RegisterScreen.tsx
    │   │   └── ForgotPasswordScreen.tsx
    │   ├── shipper/
    │   │   ├── DashboardScreen.tsx
    │   │   ├── MyLoadsScreen.tsx
    │   │   └── CreateLoadScreen.tsx
    │   ├── carrier/
    │   │   ├── DashboardScreen.tsx
    │   │   └── AvailableLoadsScreen.tsx
    │   └── common/
    │       ├── TrackingScreen.tsx
    │       ├── ChatListScreen.tsx
    │       ├── ChatScreen.tsx
    │       ├── LoadDetailScreen.tsx
    │       ├── ProfileScreen.tsx
    │       └── RatingScreen.tsx
    ├── services/
    │   ├── api.ts                   # axios + interceptor + módulos por dominio
    │   └── notifications.ts         # expo-notifications wrapper
    ├── store/
    │   └── auth.ts                  # zustand con AsyncStorage
    └── types/
        └── index.ts                 # User, Load, Trip, Message, Rating, Postulation
```

## Configuración Expo (`app.json`)

```jsonc
{
  "expo": {
    "name": "CargoLink",
    "slug": "cargolink",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "splash": { "backgroundColor": "#2563eb" },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.cargolink.app",
      "config": { "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY" },
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "...",
        "NSLocationAlwaysUsageDescription": "..."
      }
    },
    "android": {
      "package": "com.cargolink.app",
      "permissions": ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
      "config": { "googleMaps": { "apiKey": "YOUR_GOOGLE_MAPS_API_KEY" } }
    },
    "plugins": ["expo-location", "expo-notifications"]
  }
}
```

⚠️ Antes de buildear binarios reales (no Expo Go) hay que reemplazar `YOUR_GOOGLE_MAPS_API_KEY` con una clave real con Maps SDK for Android y Maps SDK for iOS habilitados.

## Navegación

Source: [`../mobile/src/navigation/AppNavigator.tsx`](../mobile/src/navigation/AppNavigator.tsx).

```
                         AppNavigator
                              │
                              ▼
                    useAuthStore.isAuthenticated?
                       /                    \
                      no                    yes
                       │                     │
                       ▼                     ▼
                  AuthStack             MainStack
                    │                        │
            ┌───────┼───────┐                ├── BottomTabs (según user.role)
            │       │       │                │     │
        Login  Register  Forgot              │     ├── Dashboard
                                              │     ├── MyLoads | AvailableLoads
                                              │     ├── Tracking
                                              │     ├── Messages
                                              │     └── Profile
                                              │
                                              ├── LoadDetail   (modal/stack)
                                              ├── Chat         (modal/stack)
                                              ├── CreateLoad   (modal/stack)
                                              └── Rating       (modal/stack)
```

- **Auth Stack**: `@react-navigation/native-stack`. Pantallas de login / register / forgot.
- **Main Stack**: `@react-navigation/native-stack` con el bottom tabs como pantalla principal y las modales como hijos.
- **Bottom Tabs**: `@react-navigation/bottom-tabs`. La lista de tabs cambia según `user.role`:
  - Shipper: Dashboard / MyLoads / Tracking / Messages / Profile.
  - Carrier: Dashboard / AvailableLoads / Tracking / Messages / Profile.
- **Iconos**: Ionicons del paquete `@expo/vector-icons`.

> La app mobile cubre solo los roles **Shipper** (`CARGO_GENERATOR`) y **Carrier** (`TRANSPORTER`) — el `RegisterScreen` solo ofrece esos dos. Los roles **`ADMIN`** y **`COMPANY_ADMIN`** (gestión de plataforma y de flotas) son exclusivos de la web; ver [`empresas.md`](./empresas.md) y [`frontend.md`](./frontend.md).

`App.tsx` arranca con `useAuthStore.hydrate()` (asíncrono, lee AsyncStorage) y muestra un splash hasta que termina — sino habría flash de la pantalla de login antes de saber que ya hay sesión.

## Pantallas por rol

### Auth
- **LoginScreen** — form con email + password, llama a `authApi.login()`.
- **RegisterScreen** — form completo con rol, persona, empresa.
- **ForgotPasswordScreen** — envía email; muestra confirmación.

### Shipper
- **DashboardScreen** — KPIs (loads activos, ofertas pendientes, en tránsito).
- **MyLoadsScreen** — lista filtrable de loads del shipper.
- **CreateLoadScreen** — modal con form para crear; usa Maps para selección de origen/destino.

### Carrier
- **DashboardScreen** — KPIs (loads disponibles, trips activos, completados).
- **AvailableLoadsScreen** — lista de loads `PUBLISHED` con filtros básicos.

### Comunes
- **TrackingScreen** — mapa con la ruta + posición actual del trip activo. El carrier reporta `PATCH /trips/:id/location` periódicamente con `expo-location`.
- **ChatListScreen** — conversaciones (GET `/messages/conversations`).
- **ChatScreen** — chat por trip; suscribe al WS para `newMessage`.
- **LoadDetailScreen** — detalle de un load, postulación (carrier) o lista de postulations (shipper).
- **ProfileScreen** — info del user, editar, logout.
- **RatingScreen** — post-trip rating.

## Cliente API (`src/services/api.ts`)

Source: [`../mobile/src/services/api.ts`](../mobile/src/services/api.ts).

```ts
const API_URL = 'http://localhost:3002/api';   // ⚠️ hardcoded
```

⚠️ Inconsistencias conocidas:
- La URL está hardcodeada — no usa env vars. Para apuntar a otro backend hay que tocar el archivo.
- El puerto (`3002`) no coincide con el backend default (`3001`). Ajustar antes de probar contra una API real.
- `localhost` desde un dispositivo físico **apunta al dispositivo, no a tu máquina**. Usar la IP LAN de tu compu o un túnel (ngrok, Cloudflare Tunnel). En emulador Android, `10.0.2.2` es el host. En simulador iOS, `localhost` funciona.

### Interceptor

```ts
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

No hay response interceptor — un 401 no desloguea automáticamente. Cada pantalla maneja sus errores.

### Módulos exportados

- `authApi` — login, register, forgotPassword, resetPassword.
- `loadsApi` — create, getAvailable, getMy, getById, cancel. **Más acotado que la versión web** (no expone `update`, `getRegister`, `exportRegister`).
- `tripsApi` — accept, getMy, getById, start, complete, updateLocation.
- `messagesApi` — send, getConversations, getConversation (por usuario), markAsRead.
  - ⚠️ Hoy usa rutas estilo `/messages/${receiverId}` y `/messages/conversation/${userId}` — el backend actual maneja chat **por trip** (`/messages/trip/:tripId`). Estos métodos hoy **fallan** contra el backend nuevo. Falta sincronizar al modelo trip-based.
- `ratingsApi` — create, getUserRatings.

(Postulations no está en mobile todavía — falta cubrir el flujo de bidding.)

## Estado

### Auth — Zustand + AsyncStorage

Source: [`../mobile/src/store/auth.ts`](../mobile/src/store/auth.ts).

Mismo shape que el frontend web, pero la persistencia es asíncrona:

```ts
login: async (user, token) => {
  await AsyncStorage.setItem('token', token);
  await AsyncStorage.setItem('user', JSON.stringify(user));
  set({ user, token, isAuthenticated: true });
},

hydrate: async () => {
  const token = await AsyncStorage.getItem('token');
  const userStr = await AsyncStorage.getItem('user');
  if (token && userStr) set({ user: JSON.parse(userStr), token, isAuthenticated: true });
}
```

`App.tsx` muestra un loader mientras `hydrate()` termina — sino flashea el login antes de saber que la sesión existe.

### Sin React Query

Cada pantalla maneja su propio `useState` + `useEffect` para fetch. Funciona pero sin caché compartido. Pasar todo a TanStack Query es un siguiente paso natural si la app crece.

## Native features

### Ubicación (`expo-location`)

Usada en **TrackingScreen** para obtener la posición del carrier en tiempo real:

```ts
import * as Location from 'expo-location';

const { status } = await Location.requestForegroundPermissionsAsync();
if (status !== 'granted') { /* mostrar mensaje */ }

const subscription = await Location.watchPositionAsync(
  { accuracy: Location.Accuracy.High, distanceInterval: 50 },
  async ({ coords }) => {
    await tripsApi.updateLocation(tripId, { lat: coords.latitude, lng: coords.longitude });
  },
);
```

Permisos solicitados:
- iOS: `NSLocationWhenInUseUsageDescription` (foreground) + `NSLocationAlwaysUsageDescription` (background si activás).
- Android: `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`.

### Mapas (`react-native-maps`)

Maps de Google nativos en iOS y Android. Requiere:
- iOS: `googleMapsApiKey` en `app.json > ios.config`.
- Android: `apiKey` en `app.json > android.config.googleMaps`.

Hoy ambos tienen el placeholder `"YOUR_GOOGLE_MAPS_API_KEY"`. Sin reemplazarlo, los mapas funcionan en Expo Go (que tiene su propia clave) pero no en builds standalone.

### Push notifications (`expo-notifications`)

Source: [`../mobile/src/services/notifications.ts`](../mobile/src/services/notifications.ts).

```ts
import * as Notifications from 'expo-notifications';

// permission
const { status } = await Notifications.requestPermissionsAsync();

// token (para registrar el device en el backend)
const token = (await Notifications.getExpoPushTokenAsync()).data;

// channel (Android)
await Notifications.setNotificationChannelAsync('default', {
  name: 'default',
  importance: Notifications.AndroidImportance.HIGH,
});

// listeners
Notifications.addNotificationReceivedListener(...);
Notifications.addNotificationResponseReceivedListener(...);
```

Nota: hoy el backend **no implementa** envío de push notifications. El plumbing del cliente está; falta el endpoint para registrar el `expoPushToken` y un servicio que use Expo's Push API (`https://exp.host/--/api/v2/push/send`).

## Scripts

```bash
npm start              # expo start — abre el dev server + QR
npm run android        # expo start --android (emulador o device conectado)
npm run ios            # expo start --ios (simulator)
npm run web            # expo start --web (correr en browser para debug rápido)
```

## Cómo correr en un device

### Opción A — Expo Go (rápido, sin build)

1. Instalar [Expo Go](https://expo.dev/client) en tu iPhone/Android.
2. `cd mobile && npm start`.
3. Escanear el QR con la app Expo Go (Android) o con la app Cámara (iOS).

Limitaciones:
- Sólo paquetes con código JS puro o módulos nativos soportados por Expo Go.
- API key de Google Maps usa la de Expo Go (no la del `app.json`).

### Opción B — Build dev custom (con EAS)

Si necesitás features fuera de Expo Go (push reales con tu Firebase, Google Maps con tu API key, etc.):

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
eas build --profile development --platform android
```

⚠️ Hoy **no hay `eas.json`** en el repo. Para usar EAS, hay que correr `eas build:configure` primero, lo que crea ese archivo.

## Apuntar a un backend que no sea localhost

Hoy con la URL hardcodeada hay tres opciones:

1. **Editar `src/services/api.ts`** y poner la IP/URL real.
2. **Refactor para soportar env vars** (`process.env.EXPO_PUBLIC_API_URL` — Expo expone las vars con prefijo `EXPO_PUBLIC_` al bundle). Recomendado.
3. **Túnel local** con `npx expo start --tunnel` (usa ngrok internamente). Resuelve el problema de `localhost` desde device.

## Caveats

- **API URL hardcodeada** (ver arriba).
- **`messagesApi` apunta a endpoints viejos** — no funciona contra el backend trip-based.
- **No usa Postulations** — el flujo de bidding no está implementado en mobile.
- **Sin `eas.json`** — no se puede buildear para stores sin configurarlo primero.
- **Sin secure storage para token** — `AsyncStorage` es plain. Para prod considerar `expo-secure-store`.
- **Google Maps API key placeholder** — funciona en Expo Go pero no en builds standalone.
- **Sin tests**.
- **Sin TanStack Query** — cada pantalla maneja su propio `useState`/`useEffect` para fetch.

## Próximos pasos lógicos

1. Migrar API URL a `EXPO_PUBLIC_API_URL`.
2. Sincronizar `messagesApi` al modelo trip-based del backend.
3. Sumar Postulations al flow del carrier.
4. Implementar backend push para `expo-notifications`.
5. Configurar EAS para builds.
6. Mover de `AsyncStorage` a `expo-secure-store` para el token.
