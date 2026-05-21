export type Role = 'CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN';

export type LoadStatus = 'PUBLISHED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type TripStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PostulationStatus = 'PENDING' | 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  companyName?: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Load {
  id: string;
  shipperId: string;
  shipper: Pick<User, 'id' | 'firstName' | 'lastName' | 'companyName'>;
  title: string;
  description?: string;
  originAddress: string;
  originLat: number;
  originLng: number;
  destAddress: string;
  destLat: number;
  destLng: number;
  cargoType: string;
  weight: number;
  volume?: number;
  pickupDate: string;
  deliveryDate?: string;
  price: number;
  status: LoadStatus;
  trip?: Trip;
  pendingPostulationsCount?: number;
  createdAt: string;
}

export interface Trip {
  id: string;
  loadId: string;
  load: Load;
  carrierId: string;
  carrier: Pick<User, 'id' | 'firstName' | 'lastName' | 'companyName'>;
  status: TripStatus;
  currentLat?: number;
  currentLng?: number;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  sender: Pick<User, 'id' | 'firstName' | 'lastName'>;
  receiverId: string;
  receiver?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface Rating {
  id: string;
  tripId: string;
  fromUserId: string;
  fromUser: Pick<User, 'id' | 'firstName' | 'lastName'>;
  toUserId: string;
  toUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  score: number;
  comment?: string;
  createdAt: string;
}

export interface Postulation {
  id: string;
  loadId: string;
  transporterId: string;
  message?: string | null;
  proposedPrice?: number | null;
  counterOfferPrice?: number | null;
  lastOfferBy?: 'SHIPPER' | 'TRANSPORTER' | null;
  status: PostulationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PostulationWithTransporter extends Postulation {
  transporter: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'companyName' | 'avatarUrl'>;
  averageRating: number;
  totalRatings: number;
}

export interface PostulationWithLoad extends Postulation {
  load: Pick<Load, 'id' | 'title' | 'status' | 'originAddress' | 'destAddress' | 'pickupDate' | 'price'> & {
    shipper: Pick<User, 'id' | 'firstName' | 'lastName' | 'companyName'>;
    trip?: { id: string } | null;
  };
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  [key: string]: T[] | number;
}

export interface AuthResponse {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;
  accessToken: string;
}
