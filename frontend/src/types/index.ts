export type Role = 'CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN' | 'COMPANY_ADMIN';

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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
  industry?: string;
  avatarUrl?: string;
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm?: number;
  isActive: boolean;
  createdAt: string;
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


// Un mes de la serie histórica de dinero. El backend devuelve siempre 12,
// incluidos los meses sin actividad, para que el gráfico no tenga huecos.
export interface MoneyMonthPoint {
  /** Mes en formato YYYY-MM. */
  month: string;
  amount: number;
  trips: number;
  km: number;
}

// Métricas de dinero — mismo cómputo para ingresos del transportista, gasto
// del dador de carga y facturación de la empresa.
export interface MoneyMetrics {
  totalAmount: number;
  amountThisMonth: number;
  avgAmountPerTrip: number | null;
  amountPerKm: number | null;
  monthly: MoneyMonthPoint[];
}

export interface CarrierMetrics extends FleetMetrics, MoneyMetrics {
  completedTrips: number;
  postulationsSent: number;
  postulationsAccepted: number;
  /** null cuando el transportista todavía no se postuló a nada. */
  postulationAcceptanceRate: number | null;
  avgRating: number | null;
  ratingsCount: number;
}

export interface ShipperMetrics extends MoneyMetrics {
  totalLoads: number;
  publishedLoads: number;
  assignedLoads: number;
  inTransitLoads: number;
  deliveredLoads: number;
  cancelledLoads: number;
  /** Cargas que consiguieron transportista sobre las no canceladas. */
  assignmentRate: number | null;
  avgHoursToAssignment: number | null;
  avgPostulationsPerLoad: number | null;
  onTimeDeliveries: number;
  lateDeliveries: number;
  onTimeRate: number | null;
  totalDistanceKm: number;
  /** Desvío promedio entre el precio publicado y el pactado (0.2 = pagó 20% más). */
  avgNegotiationDelta: number | null;
  negotiatedLoads: number;
  topCarriers: {
    id: string;
    name: string;
    completedTrips: number;
    totalSpend: number;
    avgRating: number | null;
  }[];
  spendByCargoType: { cargoType: string; trips: number; amount: number }[];
}

export interface CompanyDriverMetrics {
  id: string;
  name: string;
  avatarUrl: string | null;
  totalTrips: number;
  completedTrips: number;
  activeTrips: number;
  totalAmount: number;
  amountThisMonth: number;
  amountPerKm: number | null;
  totalDistanceKm: number;
  avgKmPerLiter: number | null;
  onTimeRate: number | null;
  lateDeliveries: number;
  avgRating: number | null;
  ratingsCount: number;
  lastCompletedAt: string | null;
  /** Sin viaje en curso ni entregas en los últimos 30 días. */
  idle: boolean;
}

export interface CompanyMetrics extends FleetMetrics, MoneyMetrics {
  driverCount: number;
  activeDriverCount: number;
  idleDriverCount: number;
  utilizationRate: number | null;
  totalTrips: number;
  completedTrips: number;
  activeTrips: number;
  driverRanking: CompanyDriverMetrics[];
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
