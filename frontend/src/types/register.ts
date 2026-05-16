import { LoadStatus, TripStatus, User } from './index';

export type RegisterStatus = Extract<LoadStatus, 'DELIVERED' | 'CANCELLED'>;

export type RegisterParticipant = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'companyName' | 'email' | 'phone'
>;

export interface RegisterMessagePreview {
  content: string;
  createdAt: string;
  senderId: string;
}

export interface RegisterTrip {
  id: string;
  status: TripStatus;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  carrier: RegisterParticipant;
  messageCount: number;
  lastMessagePreview: RegisterMessagePreview | null;
}

export interface RegisterItem {
  id: string;
  title: string;
  description: string | null;
  status: LoadStatus;
  cargoType: string;
  weight: number;
  volume: number | null;
  price: number;
  originAddress: string;
  originLat: number;
  originLng: number;
  destAddress: string;
  destLat: number;
  destLng: number;
  pickupDate: string;
  deliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  shipper: RegisterParticipant;
  trip: RegisterTrip | null;
}

export interface RegisterResponse {
  items: RegisterItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RegisterFilters {
  statuses?: RegisterStatus[];
  from?: string;
  to?: string;
  participant?: string;
  q?: string;
}
