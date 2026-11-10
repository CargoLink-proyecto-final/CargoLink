import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/env';
import type { AuthResponse } from '../types';

const api = axios.create({
  baseURL: API_URL,
  // Sin timeout axios espera indefinidamente: en móvil, con red inestable o una
  // IP de LAN equivocada, eso deja la pantalla colgada sin feedback.
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Instancia sin interceptores para el refresh: si pasara por el interceptor de
// 401, un refresh rechazado dispararía otro refresh en loop.
const bare = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * El store (zustand) importa este módulo, así que acá no se puede importar el
 * store sin armar un ciclo. En su lugar el store registra qué hacer cuando la
 * sesión se renueva o muere.
 */
export interface SessionHandlers {
  onRefreshed: (session: AuthResponse) => Promise<void> | void;
  onExpired: () => Promise<void> | void;
}
let sessionHandlers: SessionHandlers | null = null;
export function setSessionHandlers(handlers: SessionHandlers): void {
  sessionHandlers = handlers;
}

class RefreshUnavailableError extends Error {}
let inflightRefresh: Promise<AuthResponse | null> | null = null;

/**
 * Canjea el refresh token por una sesión nueva. `null` = el backend lo rechazó
 * (sesión muerta). Tira RefreshUnavailableError si no hubo red: en ese caso no
 * deslogueamos. Las llamadas concurrentes comparten la misma promesa porque el
 * refresh token es de un solo uso (canjearlo dos veces cierra la sesión).
 */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (!refreshToken) return null;
      try {
        const { data } = await bare.post<AuthResponse>('/auth/refresh', { refreshToken });
        await sessionHandlers?.onRefreshed(data);
        return data;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 400 || status === 401) return null;
        throw new RefreshUnavailableError('No se pudo renovar la sesión');
      }
    })().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/** Revoca la sesión en el backend. Best effort: el logout local sigue igual. */
export async function revokeSession(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return;
  await bare.post('/auth/logout', { refreshToken }).catch(() => undefined);
}

const isAuthEndpoint = (url?: string) => (url || '').includes('/auth/');

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// El access token dura minutos. Ante un 401 se renueva una vez con el refresh
// token y se reintenta la request; si el backend rechaza el refresh, se cierra
// la sesión (antes la app no manejaba el 401 y quedaba "logueada" sin poder
// hacer nada).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (error.response?.status !== 401 || isAuthEndpoint(config?.url)) {
      return Promise.reject(error);
    }
    if (!config || config._retried) {
      await sessionHandlers?.onExpired();
      return Promise.reject(error);
    }

    let session: AuthResponse | null;
    try {
      session = await refreshSession();
    } catch {
      return Promise.reject(error);
    }
    if (!session) {
      await sessionHandlers?.onExpired();
      return Promise.reject(error);
    }

    config._retried = true;
    config.headers = { ...config.headers, Authorization: `Bearer ${session.accessToken}` };
    return api(config);
  },
);

export default api;

export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  /**
   * Reenvía el mail de verificación. El login responde 403 con
   * `code: 'EMAIL_NOT_VERIFIED'` y sin esto la app dejaba al usuario trabado:
   * mostraba el error y no había forma de pedir otro enlace desde el teléfono.
   */
  resendVerification: (email: string) =>
    api.post('/auth/resend-verification', { email }),
};

export const loadsApi = {
  create: (data: any) => api.post('/loads', data),
  getAvailable: (params?: any) => api.get('/loads/available', { params }),
  getMy: (params?: any) => api.get('/loads/my', { params }),
  getById: (id: string) => api.get(`/loads/${id}`),
  cancel: (id: string) => api.delete(`/loads/${id}`),
};

// `POST /trips/accept/:loadId` no tiene cliente acá a propósito: quedó como
// override de ADMIN y un TRANSPORTER recibe 403. El camino de la app es
// postularse con `postulationsApi.create` y que el publicador acepte.
export const tripsApi = {
  // Los viajes propios están partidos por rol: `my` es TRANSPORTER-only y
  // `my-loads` CARGO_GENERATOR-only. Llamar el que no corresponde da 403.
  getMy: (params?: any) => api.get('/trips/my', { params }),
  getMyLoads: (params?: any) => api.get('/trips/my-loads', { params }),
  getById: (id: string) => api.get(`/trips/${id}`),
  start: (id: string) => api.patch(`/trips/${id}/start`),
  /**
   * Los litros son opcionales en el DTO, pero es el único momento en que se
   * pueden cargar: sin ellos el viaje queda fuera de las métricas de combustible.
   */
  complete: (id: string, fuelLiters?: number) =>
    api.patch(`/trips/${id}/complete`, fuelLiters != null ? { fuelLiters } : {}),
  updateLocation: (id: string, data: { lat: number; lng: number }) =>
    api.patch(`/trips/${id}/location`, data),
};

// Las conversaciones son por viaje (Trip), no entre usuarios: el backend valida
// que quien llama sea el carrier o el shipper de ese viaje.
export const messagesApi = {
  send: (tripId: string, content: string) =>
    api.post(`/messages/trip/${tripId}`, { content }),
  getConversations: () => api.get('/messages/conversations'),
  getTripMessages: (tripId: string, params?: any) =>
    api.get(`/messages/trip/${tripId}`, { params }),
  markAsRead: (tripId: string) => api.patch(`/messages/trip/${tripId}/read`),
  getUnreadCount: () => api.get('/messages/unread-count'),
};

export const usersApi = {
  getMe: () => api.get('/users/me'),
  registerPushToken: (token: string) => api.put('/users/me/push-token', { token }),
  clearPushToken: () => api.delete('/users/me/push-token'),
  updateMe: (data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    companyName?: string;
    industry?: string;
    zoneLat?: number;
    zoneLng?: number;
    zoneRadiusKm?: number;
    cuit?: string;
    licenseCategory?: string;
    licenseExpiresAt?: string;
  }) => api.patch('/users/me', data),
  /**
   * Baja definitiva de la cuenta. Apple la exige dentro de la app para cualquier
   * app con registro de usuarios (guideline 5.1.1(v)). El backend anonimiza la
   * fila en vez de borrarla, así el historial de la contraparte no se rompe.
   */
  deleteMe: () => api.delete('/users/me'),
};

// Perfil de transportista (documentos, vehículo, declaración jurada)
export const transporterProfileApi = {
  getStatus: () => api.get('/transporter-profile/status'),
  listDocuments: () => api.get('/transporter-profile/documents'),
  // `uri`/`name`/`type` es el formato que React Native espera para adjuntar un
  // archivo local a un FormData (no un objeto File del navegador).
  uploadDocument: (type: string, fileUri: string, fileName: string, mimeType: string) => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', { uri: fileUri, name: fileName, type: mimeType } as any);
    return api.post('/transporter-profile/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteDocument: (id: string) => api.delete(`/transporter-profile/documents/${id}`),
  getVehicle: () => api.get('/transporter-profile/vehicle'),
  upsertVehicle: (data: any) => api.put('/transporter-profile/vehicle', data),
  acceptTerms: (version: string) => api.post('/transporter-profile/terms', { version }),
};

export const postulationsApi = {
  create: (loadId: string, data: { message?: string; proposedPrice?: number }) =>
    api.post(`/loads/${loadId}/postulations`, data),
  listForLoad: (loadId: string) => api.get(`/loads/${loadId}/postulations`),
  listMine: (status?: string) =>
    api.get('/postulations/my', { params: status ? { status } : undefined }),
  accept: (id: string) => api.post(`/postulations/${id}/accept`),
  counterOffer: (id: string, price: number) =>
    api.post(`/postulations/${id}/counter-offer`, { price }),
  acceptOffer: (id: string) => api.post(`/postulations/${id}/accept-offer`),
  withdraw: (id: string) => api.delete(`/postulations/${id}`),
};

export const ratingsApi = {
  create: (data: { tripId: string; score: number; comment?: string }) =>
    api.post('/ratings', data),
  getUserRatings: (userId: string) => api.get(`/ratings/user/${userId}`),
};
