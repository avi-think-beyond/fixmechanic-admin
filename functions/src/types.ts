/**
 * FixMechanic Types and Domain Definitions
 * Comprehensive schema definitions for Cloud Firestore collections,
 * roles, and authoritative state transitions.
 */

export type UserRole = "CUSTOMER" | "MECHANIC" | "ADMIN";

export type MechanicApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type ServiceRequestStatus =
  | "REQUESTED"
  | "SEARCHING"
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type JobOfferStatus = "PENDING" | "ACCEPTED" | "LOST" | "EXPIRED" | "CANCELLED";

export type JobChatStatus = "OPEN" | "CLOSED";

export type VehicleType = "TWO_WHEELER" | "FOUR_WHEELER_CAR" | "COMMERCIAL_LIGHT" | "EV_TWO_WHEELER" | "EV_FOUR_WHEELER";

export interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
  geohash?: string;
  updatedAt?: number;
}

export interface UserRecord {
  uid: string;
  role: UserRole;
  email?: string;
  phone?: string;
  displayName?: string;
  createdAt: number;
  disabled?: boolean;
}

export interface CustomerProfile {
  customerId: string;
  name: string;
  phone: string;
  defaultVehicleType?: VehicleType;
  defaultVehicleRegNumber?: string;
  emergencyContact?: string;
  createdAt: number;
}

export interface MechanicProfile {
  mechanicId: string;
  name: string;
  phone: string;
  email?: string;
  approvalStatus: MechanicApprovalStatus;
  rejectionReason?: string;
  isOnline: boolean;
  isBusy: boolean;
  activeJobId?: string | null;
  vehicleTypes: VehicleType[];
  serviceCategories: string[];
  currentLocation?: GeoLocation;
  serviceAreaId: string;
  ratingAverage: number;
  ratingCount: number;
  createdAt: number;
  verifiedAt?: number;
  verifiedBy?: string;
}

export interface MechanicServiceArea {
  id: string;
  name: string;
  locality: string;
  center: { lat: number; lng: number };
  radiusKm: number;
  active: boolean;
}

export interface ServiceCategory {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  baseFareEst: number;
}

export interface ServiceRequest {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone: string;
  vehicleType: VehicleType;
  vehicleRegNumber: string;
  serviceCategory: string;
  description?: string;
  location: GeoLocation;
  status: ServiceRequestStatus;
  assignedMechanicId?: string | null;
  assignedMechanicName?: string | null;
  dispatchBatch: number;
  searchRadiusKm: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
  cancellationReason?: string;
  cancelledBy?: string;
}

export interface JobOffer {
  id: string;
  requestId: string;
  mechanicId: string;
  mechanicName?: string;
  distanceKm: number;
  status: JobOfferStatus;
  offeredAt: number;
  expiresAt: number;
  respondedAt?: number;
}

export interface JobAssignment {
  id: string;
  requestId: string;
  mechanicId: string;
  customerId: string;
  assignedAt: number;
  initialAcceptedAt?: number;
  completedAt?: number;
}

export interface JobStatusEvent {
  id: string;
  requestId: string;
  fromStatus: ServiceRequestStatus;
  toStatus: ServiceRequestStatus;
  actorId: string;
  actorRole: UserRole | "SYSTEM";
  note?: string;
  timestamp: number;
}

export interface JobChat {
  id: string; // equals requestId
  requestId: string;
  customerId: string;
  mechanicId: string;
  status: JobChatStatus;
  createdAt: number;
  closedAt?: number;
  closedReason?: string;
}

export interface JobMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderRole: UserRole;
  text: string;
  timestamp: number;
}

export interface RatingRecord {
  id: string;
  requestId: string;
  customerId: string;
  mechanicId: string;
  score: number;
  feedback?: string;
  createdAt: number;
}

export interface DeviceTokenRecord {
  id: string;
  userId: string;
  role: UserRole;
  token: string;
  platform: "android" | "web" | "ios";
  updatedAt: number;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  adminEmail?: string;
  action: string;
  targetType: "MECHANIC" | "SERVICE_REQUEST" | "SYSTEM_CONFIG" | "SERVICE_AREA";
  targetId: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export interface ApplicationConfig {
  defaultSearchRadiusKm: number;
  maxSearchRadiusKm: number;
  radiusExpansionStepKm: number;
  initialOfferBatchSize: number;
  offerTimeoutSeconds: number;
  maxMechanicDispatchAttempts: number;
  localityName: string;
  localityCenter: { lat: number; lng: number };
  maxMechanicLocationStalenessMinutes: number;
  chatAutoCloseOnCompletion: boolean;
}
