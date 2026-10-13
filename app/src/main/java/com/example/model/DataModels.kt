package com.example.model

enum class MechanicApprovalStatus {
  PENDING,
  APPROVED,
  REJECTED,
  SUSPENDED
}

enum class ServiceRequestStatus {
  REQUESTED,
  SEARCHING,
  ASSIGNED,
  ACCEPTED,
  EN_ROUTE,
  ARRIVED,
  IN_PROGRESS,
  COMPLETED,
  CANCELLED
}

data class MechanicItem(
  val id: String,
  val name: String,
  val phone: String,
  val email: String? = null,
  val approvalStatus: MechanicApprovalStatus,
  val isOnline: Boolean,
  val isBusy: Boolean,
  val activeJobId: String? = null,
  val vehicleTypes: List<String>,
  val serviceCategories: List<String>,
  val address: String,
  val lat: Double,
  val lng: Double,
  val rating: Double = 5.0,
  val ratingCount: Int = 0
)

data class ServiceRequestItem(
  val id: String,
  val customerName: String,
  val customerPhone: String,
  val vehicleType: String,
  val vehicleRegNumber: String,
  val serviceCategory: String,
  val status: ServiceRequestStatus,
  val assignedMechanicId: String? = null,
  val assignedMechanicName: String? = null,
  val dispatchBatch: Int = 1,
  val searchRadiusKm: Double = 5.0,
  val address: String,
  val createdAt: Long = System.currentTimeMillis(),
  val timeline: List<TimelineEventItem> = emptyList()
)

data class TimelineEventItem(
  val fromStatus: String,
  val toStatus: String,
  val actor: String,
  val timestamp: Long = System.currentTimeMillis()
)

data class AuditLogItem(
  val id: String,
  val action: String,
  val admin: String,
  val targetType: String,
  val targetId: String,
  val details: String,
  val timestamp: Long = System.currentTimeMillis()
)

data class DispatchConfigItem(
  val defaultSearchRadiusKm: Double = 5.0,
  val maxSearchRadiusKm: Double = 15.0,
  val initialOfferBatchSize: Int = 3,
  val offerTimeoutSeconds: Int = 45,
  val maxDispatchRetries: Int = 3,
  val maxStalenessMinutes: Int = 20,
  val localityName: String = "Gurugram (Sector 29 Pilot Zone)"
)

data class CsvParseResult(
  val totalRows: Int,
  val validRows: List<MechanicItem>,
  val invalidRows: List<Pair<Int, String>>,
  val duplicateCount: Int
)
