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
  accept: (loadId: string) => api.post(`/trips/accept/${loadId}`),
  getMy: (params?: any) => api.get('/trips/my', { params }),
  getById: (id: string) => api.get(`/trips/${id}`),
  start: (id: string) => api.patch(`/trips/${id}/start`),
  complete: (id: string) => api.patch(`/trips/${id}/complete`),
  updateLocation: (id: string, data: { lat: number; lng: number }) =>
    api.patch(`/trips/${id}/location`, data),
};

export const messagesApi = {
  send: (receiverId: string, content: string) =>
    api.post(`/messages/${receiverId}`, { content }),
  getConversations: () => api.get('/messages/conversations'),
  getConversation: (userId: string, params?: any) =>
    api.get(`/messages/conversation/${userId}`, { params }),
  markAsRead: (senderId: string) => api.patch(`/messages/read/${senderId}`),
};

export const ratingsApi = {
  create: (data: { tripId: string; score: number; comment?: string }) =>
    api.post('/ratings', data),
  getUserRatings: (userId: string) => api.get(`/ratings/user/${userId}`),
};
