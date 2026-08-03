export type Role = 'CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN' | 'COMPANY_ADMIN';
export type LoadStatus = 'PUBLISHED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type TripStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PostulationStatus =
  | 'PENDING'
  | 'NEGOTIATING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  companyName?: string;
  // Rubro del publicador. Contexto que el transportista ve en el detalle de la carga.
  industry?: string;
  avatarUrl?: string;
  // Zona de influencia del transportista: centro + radio. Cuando está definida,
  // el backend ordena GET /loads/available por cercanía del origen a este punto.
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm?: number;
  isActive: boolean;
}

export interface Load {
  id: string;
  shipperId: string;
  shipper: Pick<User, 'id' | 'firstName' | 'lastName' | 'companyName' | 'industry'>;
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
  packageCount?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
  pickupDate: string;
  deliveryDate?: string;
  price: number;
  // Techo opcional que el publicador está dispuesto a pagar. Sólo tiene sentido
  // junto a `price`: acota el rango de negociación de las postulaciones.
  maxBudget?: number;
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
  createdAt: string;
}

export interface Postulation {
  id: string;
  loadId: string;
  load?: Load;
  transporterId: string;
  transporter?: Pick<User, 'id' | 'firstName' | 'lastName' | 'companyName'>;
  message?: string;
  proposedPrice?: number;
  counterOfferPrice?: number;
  // Quién hizo la última oferta: sirve para saber a quién le toca responder.
  lastOfferBy?: string;
  status: PostulationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  sender: Pick<User, 'id' | 'firstName' | 'lastName'>;
  receiverId: string;
  receiver?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  // Las conversaciones son por viaje, no entre usuarios sueltos.
  tripId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

// Fila del listado de conversaciones (GET /messages/conversations). No es un
// Message: el backend agrega el viaje, el otro participante y el no-leído.
export interface Conversation {
  tripId: string;
  tripStatus: TripStatus;
  loadTitle: string;
  otherUser: Pick<User, 'id' | 'firstName' | 'lastName'>;
  lastMessage: Message | null;
  unreadCount: number;
}

export interface AuthResponse {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;
  accessToken: string;
}
