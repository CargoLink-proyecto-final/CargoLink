export type Role = 'CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN' | 'COMPANY_ADMIN';

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type LoadStatus = 'PUBLISHED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type TripStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PostulationStatus = 'PENDING' | 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

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
  industry?: string;
  avatarUrl?: string;
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm?: number;
  // Perfil de transportista (P13)
  cuit?: string;
  licenseCategory?: string;
  licenseExpiresAt?: string;
  termsAcceptedAt?: string;
  isActive: boolean;
  createdAt: string;
}

export interface TransporterDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
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

export interface ProfileStatus {
  complete: boolean;
  missing: string[];
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
  fuelLiters?: number | null;
  distanceKm?: number | null;
  notes?: string;
  ratings?: Rating[];
  createdAt: string;
}

// Métricas de combustible y puntualidad de una flota (un transportista o un
// conductor de empresa). El backend las calcula con el mismo helper en ambos casos.
export interface FleetMetrics {
  onTimeDeliveries: number;
  lateDeliveries: number;
  onTimeRate: number | null;
  totalDistanceKm: number;
  totalFuelLiters: number;
  avgKmPerLiter: number | null;
  litersThisMonth: number;
  kmThisMonth: number;
  monthLabel: string;
}

export interface CarrierMetrics extends FleetMetrics {
  completedTrips: number;
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

export interface RoleChangeLog {
  id: string;
  userId: string;
  changedById: string;
  oldRole: Role;
  newRole: Role;
  createdAt: string;
  changedBy?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
}

// ---- Company admin (fleet) ----

export type CompanyDriver = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'avatarUrl'
>;

export interface CompanyOverview {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  pendingRequests: number;
}

export interface CompanyJoinRequest {
  id: string;
  status: JoinRequestStatus;
  createdAt: string;
  decidedAt?: string | null;
  transporter?: CompanyDriver;
  company?: { id: string; name: string };
}

export interface DriverStats extends FleetMetrics {
  driver: CompanyDriver;
  totalTrips: number;
  completedTrips: number;
  activeTrips: number;
  totalRevenue: number;
  avgRating: number | null;
  ratingsCount: number;
}

export interface CompanyDirectoryItem {
  id: string;
  name: string;
  _count: { members: number };
}

export interface MyMembership {
  company: { id: string; name: string } | null;
  requests: CompanyJoinRequest[];
}

export interface CompanyTrip {
  id: string;
  status: TripStatus;
  createdAt: string;
  completedAt?: string | null;
  load: Pick<Load, 'id' | 'title' | 'originAddress' | 'destAddress' | 'price' | 'deliveryDate'>;
  carrier: CompanyDriver;
}
