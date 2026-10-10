export type Role = 'CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN' | 'COMPANY_ADMIN';
export type LoadStatus = 'PUBLISHED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type TripStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
/**
 * Autor de la última oferta en una negociación.
 *
 * Son valores propios del dominio de postulaciones, **no** roles: el backend
 * escribe `'SHIPPER'` (`postulations.service.ts`), no `'CARGO_GENERATOR'`.
 */
export type OfferParty = 'SHIPPER' | 'TRANSPORTER';

export type PostulationStatus =
  | 'PENDING'
  | 'NEGOTIATING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type DocumentType =
  | 'DNI_FRONT'
  | 'DNI_BACK'
  | 'LICENSE_FRONT'
  | 'LICENSE_BACK'
  | 'AFIP_CONSTANCIA'
  | 'VEHICLE_CARD'
  | 'INSURANCE'
  | 'VTV';
export type DocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type VehicleType = 'CAMION' | 'CAMIONETA' | 'FURGON' | 'SEMIRREMOLQUE' | 'BATEA' | 'OTRO';

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
  // Perfil de transportista (P13)
  cuit?: string;
  licenseCategory?: string;
  licenseExpiresAt?: string;
  termsAcceptedAt?: string;
  isActive: boolean;
}

export interface TransporterDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  // Motivo que escribió el admin al rechazar; null si no fue rechazado.
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  userId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  type: VehicleType;
  maxWeightKg: number;
  maxVolumeM3?: number | null;
  heightCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  refrigerated: boolean;
  hazardousMaterials: boolean;
  bulkLiquid: boolean;
  insuranceExpiresAt?: string | null;
  vtvExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VerificationState = 'REJECTED' | 'INCOMPLETE' | 'PENDING_REVIEW' | 'APPROVED';

export interface ProfileStatus {
  // Cargó todo lo obligatorio (no implica revisión del admin).
  complete: boolean;
  // Completo y con todos los documentos aprobados — recién ahí puede postularse.
  approved: boolean;
  state: VerificationState;
  missing: string[];
  pendingReview: DocumentType[];
  rejected: DocumentType[];
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
  // Opcional: sin precio, la carga sale "a convenir" y lo fija la postulación.
  price?: number | null;
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
  // Sólo viene en el detalle de la carga (`GET /loads/:id`), que incluye
  // `trip.ratings`. Sirve para saber si el publicador ya calificó el viaje.
  ratings?: Rating[];
  createdAt: string;
}

export interface Rating {
  id: string;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  score: number;
  comment?: string;
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
  // Ojo: el backend usa 'SHIPPER', no el nombre del rol ('CARGO_GENERATOR').
  lastOfferBy?: OfferParty;
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
