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
