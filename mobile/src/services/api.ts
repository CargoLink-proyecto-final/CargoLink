import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/env';

const api = axios.create({
  baseURL: API_URL,
  // Sin timeout axios espera indefinidamente: en móvil, con red inestable o una
  // IP de LAN equivocada, eso deja la pantalla colgada sin feedback.
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
};

export const loadsApi = {
  create: (data: any) => api.post('/loads', data),
  getAvailable: (params?: any) => api.get('/loads/available', { params }),
  getMy: (params?: any) => api.get('/loads/my', { params }),
  getById: (id: string) => api.get(`/loads/${id}`),
  cancel: (id: string) => api.delete(`/loads/${id}`),
};

export const tripsApi = {
  // Override de ADMIN que saltea el ciclo de postulación: un TRANSPORTER recibe
  // 403. Para postularse va `postulationsApi.create`.
  accept: (loadId: string) => api.post(`/trips/accept/${loadId}`),
  // Los viajes propios están partidos por rol: `my` es TRANSPORTER-only y
  // `my-loads` CARGO_GENERATOR-only. Llamar el que no corresponde da 403.
  getMy: (params?: any) => api.get('/trips/my', { params }),
  getMyLoads: (params?: any) => api.get('/trips/my-loads', { params }),
  getById: (id: string) => api.get(`/trips/${id}`),
  start: (id: string) => api.patch(`/trips/${id}/start`),
  complete: (id: string) => api.patch(`/trips/${id}/complete`),
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
  }) => api.patch('/users/me', data),
  /**
   * Baja definitiva de la cuenta. Apple la exige dentro de la app para cualquier
   * app con registro de usuarios (guideline 5.1.1(v)). El backend anonimiza la
   * fila en vez de borrarla, así el historial de la contraparte no se rompe.
   */
  deleteMe: () => api.delete('/users/me'),
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
