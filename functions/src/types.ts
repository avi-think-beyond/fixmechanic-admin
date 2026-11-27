export type UserRole = "CUSTOMER" | "MECHANIC" | "ADMIN";

export type MechanicApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

export type ServiceRequestStatus =
  | "REQUESTED"
  | "SEARCHING"
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type JobOfferStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "LOST"
  | "EXPIRED";

export type VehicleType =
  | "TWO_WHEELER"
  | "FOUR_WHEELER_CAR"
  | "COMMERCIAL_LIGHT"
  | "EV_TWO_WHEELER"
  | "EV_FOUR_WHEELER";

export interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
  landmark?: string;
  city?: string;
  geohash?: string;
  isGpsAccurate?: boolean;
  updatedAt?: number;
}

export interface UserRecord {
  uid: string;
  role: UserRole;
  email?: string;
  phone?: string;
  displayName?: string;
  disabled?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface MechanicProfile {
  mechanicId: string;
  name: string;
  phone: string;
  email?: string;
  workshopName?: string;
  approvalStatus: MechanicApprovalStatus;
  rejectionReason?: string | null;
  statusReason?: string | null;
  verifiedAt?: number | null;
  verifiedBy?: string | null;
  isOnline: boolean;
  isBusy: boolean;
  activeJobId?: string | null;
  vehicleTypes: VehicleType[];
  serviceCategories: string[];
  serviceRadiusKm?: number;
  experienceYears?: number;
  verificationIdNumber?: string;
  currentLocation?: GeoLocation | null;
  ratingAverage: number;
  ratingCount: number;
  totalCompletedJobs?: number;
  todayEarningsInr?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ServiceRequest {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  vehicleType: VehicleType;
  vehicleMakeModel?: string;
  vehicleRegNumber: string;
  serviceCategory: string;
  issueTitle?: string;
  description?: string;
  photoUri?: string | null;
  estimatedPriceInr?: number;
  finalPartsFee?: number;
  totalPaid?: number;
  ratingGiven?: number | null;
  feedbackComment?: string | null;
  location: GeoLocation;
  status: ServiceRequestStatus;
  assignedMechanicId?: string | null;
  assignedMechanicName?: string | null;
  assignedMechanicPhoneMasked?: string | null;
  assignedMechanicLocation?: GeoLocation | null;
  dispatchBatch: number;
  searchRadiusKm: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
  cancelledAt?: number | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
}

export interface JobOffer {
  id: string;
  requestId: string;
  mechanicId: string;
  mechanicName?: string;
  distanceKm: number;
  vehicleType?: VehicleType;
  vehicleMakeModel?: string;
  serviceCategory?: string;
  issueTitle?: string;
  locality?: string;
  estimatedPriceInr?: number;
  status: JobOfferStatus;
  offeredAt: number;
  expiresAt: number;
  respondedAt?: number | null;
  rejectionReason?: string | null;
}

export interface JobAssignment {
  id: string;
  requestId: string;
  mechanicId: string;
  customerId: string;
  customerDisplayName?: string;
  customerPhoneMasked?: string;
  vehicleType?: VehicleType;
  vehicleMakeModel?: string;
  vehicleRegNumber?: string;
  serviceCategory?: string;
  issueTitle?: string;
  estimatedPriceInr?: number;
  assignedAt: number;
  initialAcceptedAt?: number;
}

export interface JobStatusEvent {
  id: string;
  requestId: string;
  fromStatus: ServiceRequestStatus | "NONE";
  toStatus: ServiceRequestStatus;
  actorId: string;
  actorRole: UserRole | "SYSTEM";
  note?: string;
  timestamp: number;
}

export interface JobChat {
  id: string;
  requestId: string;
  customerId: string;
  mechanicId: string;
  status: "OPEN" | "CLOSED";
  createdAt: number;
  closedAt?: number | null;
  closedReason?: string | null;
}

export interface JobMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderRole: UserRole;
  text: string;
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

export interface CsvMechanicRow {
  name: string;
  phone: string;
  email?: string;
  vehicleTypes?: string;
  serviceCategories?: string;
  locality?: string;
  lat?: string | number;
  lng?: string | number;
}

export interface CsvValidationResult {
  totalRows: number;
  validRows: Array<{
    rowIndex: number;
    data: Partial<MechanicProfile>;
  }>;
  invalidRows: Array<{
    rowIndex: number;
    raw: CsvMechanicRow;
    errors: string[];
  }>;
  duplicateCount: number;
}
