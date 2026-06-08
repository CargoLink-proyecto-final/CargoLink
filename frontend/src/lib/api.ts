import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // Token por pestaña (sessionStorage). Ver store/auth.ts: cada pestaña tiene
    // su propia sesión, así dos cuentas en el mismo navegador no se pisan.
    const token = sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl: string = error.config?.url || '';
    const isAuthEndpoint = requestUrl.includes('/auth/');
    if (error.response?.status === 401 && typeof window !== 'undefined' && !isAuthEndpoint) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
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
