import Constants from 'expo-constants';

/** Puerto en el que escucha el backend NestJS en desarrollo (ver docker-compose.yml). */
const DEV_API_PORT = 3001;

/**
 * Host de la máquina que corre Metro, ej. "192.168.1.42".
 *
 * Por qué: en el simulador de iOS `localhost` apunta al Mac y funciona, pero en un
 * dispositivo físico apunta al teléfono mismo y el request muere. Expo ya conoce la
 * IP de LAN porque el celular se conectó a Metro por ahí, así que la reusamos en vez
 * de obligar a cada dev a hardcodear su IP.
 */
function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Fallback para dev clients viejos, donde la IP vive en otra propiedad.
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(':')[0]?.trim();
  return host ? host : null;
}

function resolveApiUrl(): string {
  // 1. Override explícito — el que usás para apuntar a Cloud Run dev o prod.
  const fromEnv = process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, '');
  }

  // 2. Desarrollo: backend local en la misma máquina que Metro.
  const host = metroHost();
  if (host) return `http://${host}:${DEV_API_PORT}/api`;

  // 3. Último recurso (tests, web): simulador contra backend local.
  return `http://localhost:${DEV_API_PORT}/api`;
}

export const API_URL = resolveApiUrl();

/** El gateway de chat vive en el namespace /chat del mismo server, sin el prefijo /api. */
export const SOCKET_URL = API_URL.replace(/\/api$/, '');

/**
 * Style de MapLibre para el mapa de seguimiento.
 *
 * OpenFreeMap sirve tiles vectoriales de OpenStreetMap sin API key ni cuota, que
 * es la razón por la que el mobile usa MapLibre y no react-native-maps: en
 * Android el mapa base lo renderizaría el SDK de Google y sin una key facturable
 * queda gris. Además nos deja iguales al web (Leaflet + OSM) y al ruteo, que ya
 * va contra OSRM en `src/services/routing.ts`.
 *
 * Se puede apuntar a otro proveedor (MapTiler, Stadia, un style propio) con
 * EXPO_PUBLIC_MAP_STYLE_URL sin tocar código.
 */
export const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ??
  (Constants.expoConfig?.extra?.mapStyleUrl as string | undefined) ??
  'https://tiles.openfreemap.org/styles/liberty';
