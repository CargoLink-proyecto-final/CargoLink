import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
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
  toggleActive: (id: string) => api.patch(`/users/${id}/toggle-active`),
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
};

// Trips
export const tripsApi = {
  accept: (loadId: string) => api.post(`/trips/accept/${loadId}`),
  getAll: (params?: any) => api.get('/trips', { params }),
  getMy: (params?: any) => api.get('/trips/my', { params }),
  getById: (id: string) => api.get(`/trips/${id}`),
  start: (id: string) => api.patch(`/trips/${id}/start`),
  complete: (id: string) => api.patch(`/trips/${id}/complete`),
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
