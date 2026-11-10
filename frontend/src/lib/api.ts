import axios from 'axios';
import type { DocumentDecision } from '@/types';
import { useAuthStore } from '@/store/auth';
import { API_URL, expiresSoon, refreshSession, SESSION_KEYS } from './session';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

const isAuthEndpoint = (url: string | undefined) => (url || '').includes('/auth/');

/** Cierra la sesión local y manda al login. */
function endSession(): void {
  useAuthStore.getState().logout();
  window.location.href = '/auth/login';
}

/** Renueva la sesión y la guarda en el store. Devuelve el access token nuevo. */
async function renewAccessToken(): Promise<string | null> {
  const session = await refreshSession();
  if (!session) return null;
  useAuthStore.getState().setSession(session.user, session.accessToken, session.refreshToken);
  return session.accessToken;
}

api.interceptors.request.use(async (config) => {
  if (typeof window === 'undefined') return config;
  // Token por pestaña (sessionStorage). Ver store/auth.ts: cada pestaña tiene
  // su propia sesión, así dos cuentas en el mismo navegador no se pisan.
  let token = sessionStorage.getItem(SESSION_KEYS.accessToken);
  // El access token dura minutos: si está por vencer lo renovamos antes de
  // mandar la request, en vez de esperar el 401 y reintentar.
  if (token && !isAuthEndpoint(config.url) && expiresSoon(token)) {
    token = (await renewAccessToken().catch(() => null)) ?? token;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status !== 401 ||
      typeof window === 'undefined' ||
      isAuthEndpoint(config?.url)
    ) {
      return Promise.reject(error);
    }

    // Un 401 después de reintentar con un token recién renovado: la sesión no
    // sirve (ej. cuenta desactivada). No reintentamos en loop. Sin config no
    // hay request que reintentar.
    if (!config || config._retried) {
      endSession();
      return Promise.reject(error);
    }

    let token: string | null;
    try {
      token = await renewAccessToken();
    } catch {
      // Sin red no deslogueamos: la sesión puede seguir viva.
      return Promise.reject(error);
    }
    if (!token) {
      endSession();
      return Promise.reject(error);
    }

    config._retried = true;
    config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
    return api(config);
  },
);

export default api;

// Auth
export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  verifyEmail: (token: string) => api.get(`/auth/verify-email/${encodeURIComponent(token)}`),
  resendVerification: (email: string) => api.post('/auth/resend-verification', { email }),
};

// Users
export const usersApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: any) => api.patch('/users/me', data),
  getAll: (params?: any) => api.get('/users', { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  deactivateUser: (id: string) => api.patch(`/users/${id}/deactivate`),
  reactivateUser: (id: string) => api.patch(`/users/${id}/reactivate`),
  changeUserEmail: (id: string, email: string) => api.patch(`/users/${id}/email`, { email }),
  changeUserRole: (id: string, role: string) => api.patch(`/users/${id}/role`, { role }),
  getUserRoleHistory: (id: string) => api.get(`/users/${id}/role-history`),
};

// Loads
export const loadsApi = {
  create: (data: any) => api.post('/loads', data),
  getAll: (params?: any) => api.get('/loads', { params }),
  getAvailable: (params?: any) => api.get('/loads/available', { params }),
  getMy: (params?: any) => api.get('/loads/my', { params }),
  getById: (id: string) => api.get(`/loads/${id}`),
  update: (id: string, data: any) => api.patch(`/loads/${id}`, data),
  cancel: (id: string) => api.delete(`/loads/${id}`),
  getRegister: (params?: any) => api.get('/loads/register', { params }),
  exportRegister: (params?: any) =>
    api.get('/loads/register/export', { params, responseType: 'blob' }),
};

// Trips
export const tripsApi = {
  accept: (loadId: string) => api.post(`/trips/accept/${loadId}`),
  getAll: (params?: any) => api.get('/trips', { params }),
  getMy: (params?: any) => api.get('/trips/my', { params }),
  getMyLoads: (params?: any) => api.get('/trips/my-loads', { params }),
  getById: (id: string) => api.get(`/trips/${id}`),
  getMetrics: () => api.get('/trips/metrics'),
  start: (id: string) => api.patch(`/trips/${id}/start`),
  complete: (id: string, data?: { fuelLiters?: number }) =>
    api.patch(`/trips/${id}/complete`, data ?? {}),
  updateLocation: (id: string, data: { lat: number; lng: number }) =>
    api.patch(`/trips/${id}/location`, data),
};

// Messages
export const messagesApi = {
  send: (tripId: string, content: string) =>
    api.post(`/messages/trip/${tripId}`, { content }),
  getConversations: () => api.get('/messages/conversations'),
  getTripMessages: (tripId: string, params?: any) =>
    api.get(`/messages/trip/${tripId}`, { params }),
  markAsRead: (tripId: string) => api.patch(`/messages/trip/${tripId}/read`),
  getUnreadCount: () => api.get('/messages/unread-count'),
};

// Ratings
export const ratingsApi = {
  create: (data: { tripId: string; score: number; comment?: string }) =>
    api.post('/ratings', data),
  getUserRatings: (userId: string) => api.get(`/ratings/user/${userId}`),
};

// Companies (fleet / company admin)
// Padrón geográfico oficial (provincias y localidades censales) — alimenta los
// selectores con búsqueda de ciudad/provincia.
export const geoApi = {
  // Ciudades presentes en las cargas visibles — alimenta el filtro sin ofrecer
  // las 4.027 del padrón, que en su mayoría devolverían tabla vacía.
  getLoadFilterCities: () => api.get('/loads/filter-cities'),
  getProvinces: () => api.get('/geo/provinces'),
  searchCities: (params: { provinceId?: string; q?: string; limit?: number }) =>
    api.get('/geo/cities', { params }),
};

export const companiesApi = {
  // Directory + driver side
  list: () => api.get('/companies'),
  getMyMembership: () => api.get('/companies/my-membership'),
  requestToJoin: (companyId: string) =>
    api.post('/companies/join-requests', { companyId }),
  cancelJoinRequest: (requestId: string) =>
    api.delete(`/companies/join-requests/${requestId}`),
  leave: () => api.post('/companies/leave'),
  // Company admin side (scoped to the owned company)
  getMyCompany: () => api.get('/companies/me'),
  getDrivers: () => api.get('/companies/me/drivers'),
  removeDriver: (driverId: string) =>
    api.delete(`/companies/me/drivers/${driverId}`),
  getDriverStats: (driverId: string) =>
    api.get(`/companies/me/drivers/${driverId}/stats`),
  getRequests: (params?: { status?: string }) =>
    api.get('/companies/me/requests', { params }),
  decideRequest: (requestId: string, decision: 'APPROVE' | 'REJECT') =>
    api.patch(`/companies/me/requests/${requestId}`, { decision }),
  getTrips: (params?: {
    status?: string;
    driverId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => api.get('/companies/me/trips', { params }),
};

// Transporter profile (documentos, vehículo, declaración jurada)
export const transporterProfileApi = {
  getStatus: () => api.get('/transporter-profile/status'),
  listDocuments: () => api.get('/transporter-profile/documents'),
  uploadDocument: (type: string, file: File) => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    return api.post('/transporter-profile/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteDocument: (id: string) => api.delete(`/transporter-profile/documents/${id}`),
  // El endpoint exige auth (son DNI y licencias) — no se puede linkear directo
  // como <a href>, hay que traerlo como blob y abrirlo con una object URL.
  getDocumentFile: (id: string) =>
    api.get(`/transporter-profile/documents/${id}/file`, { responseType: 'blob' }),
  getVehicle: () => api.get('/transporter-profile/vehicle'),
  upsertVehicle: (data: any) => api.put('/transporter-profile/vehicle', data),
  acceptTerms: (version: string) => api.post('/transporter-profile/terms', { version }),
};

// Revisión de documentación de transportistas (solo ADMIN). Los archivos se
// abren con transporterProfileApi.getDocumentFile, que también admite al ADMIN.
export const transporterReviewApi = {
  getQueue: () => api.get('/admin/transporter-reviews'),
  getProfile: (userId: string) => api.get(`/admin/transporter-reviews/${userId}`),
  review: (userId: string, decisions: DocumentDecision[]) =>
    api.post(`/admin/transporter-reviews/${userId}`, { decisions }),
};

// Postulations
export const postulationsApi = {
  create: (loadId: string, data: { message?: string; proposedPrice?: number }) =>
    api.post(`/loads/${loadId}/postulations`, data),
  getForLoad: (loadId: string) => api.get(`/loads/${loadId}/postulations`),
  getMy: (params?: { status?: string }) => api.get('/postulations/my', { params }),
  accept: (postulationId: string) => api.post(`/postulations/${postulationId}/accept`),
  counterOffer: (postulationId: string, price: number) =>
    api.post(`/postulations/${postulationId}/counter-offer`, { price }),
  acceptOffer: (postulationId: string) =>
    api.post(`/postulations/${postulationId}/accept-offer`),
  withdraw: (postulationId: string) => api.delete(`/postulations/${postulationId}`),
};
