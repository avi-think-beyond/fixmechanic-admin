package com.example

import com.example.data.AdminRepository
import com.example.model.AdminSessionState
import com.example.model.AuditLogItem
import com.example.model.DispatchConfigItem
import com.example.model.MechanicApprovalStatus
import com.example.model.MechanicItem
import com.example.model.ServiceRequestItem
import com.example.model.ServiceRequestStatus
import com.example.model.TimelineEventItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class FakeInMemoryAdminRepository : AdminRepository {
  private val _sessionState = MutableStateFlow<AdminSessionState>(
    AdminSessionState.Authenticated("admin_test", "admin@fixmechanic.in", "Test Admin")
  )
  override val sessionState: StateFlow<AdminSessionState> = _sessionState.asStateFlow()

  private val _mechanics = MutableStateFlow(
    listOf(
      MechanicItem(
        id = "mech_101",
        name = "Rajesh Sharma",
        phone = "9810123401",
        email = "rajesh@example.com",
        approvalStatus = MechanicApprovalStatus.APPROVED,
        isOnline = true,
        isBusy = false,
        vehicleTypes = listOf("TWO_WHEELER", "FOUR_WHEELER_CAR"),
        serviceCategories = listOf("FLAT_TYRE", "BATTERY_JUMPSTART"),
        address = "Sector 29 Gurugram",
        lat = 28.4682,
        lng = 77.0617
      ),
      MechanicItem(
        id = "mech_102",
        name = "Amit Kumar",
        phone = "9810123402",
        email = "amit@example.com",
        approvalStatus = MechanicApprovalStatus.PENDING,
        isOnline = false,
        isBusy = false,
        vehicleTypes = listOf("TWO_WHEELER"),
        serviceCategories = listOf("FLAT_TYRE"),
        address = "DLF Phase 4 Gurugram",
        lat = 28.4725,
        lng = 77.0850
      )
    )
  )
  override val mechanics: StateFlow<List<MechanicItem>> = _mechanics.asStateFlow()

  private val _requests = MutableStateFlow(
    listOf(
      ServiceRequestItem(
        id = "REQ-901",
        customerName = "Ananya Gupta",
        customerPhone = "9811223344",
        vehicleType = "FOUR_WHEELER_CAR",
        vehicleRegNumber = "HR26-DK-4819",
        serviceCategory = "BATTERY_JUMPSTART",
        status = ServiceRequestStatus.EN_ROUTE,
        assignedMechanicId = "mech_101",
        assignedMechanicName = "Rajesh Sharma",
        address = "Sector 29 Gurugram",
        timeline = listOf(TimelineEventItem("SEARCHING", "ASSIGNED", "SYSTEM"))
      )
    )
  )
  override val requests: StateFlow<List<ServiceRequestItem>> = _requests.asStateFlow()

  private val _auditLogs = MutableStateFlow(
    listOf(
      AuditLogItem(
        id = "LOG_1",
        action = "SYSTEM_INIT",
        admin = "SYSTEM",
        targetType = "SYSTEM_CONFIG",
        targetId = "current",
        details = "Initialized test repo"
      )
    )
  )
  override val auditLogs: StateFlow<List<AuditLogItem>> = _auditLogs.asStateFlow()

  private val _config = MutableStateFlow(DispatchConfigItem())
  override val config: StateFlow<DispatchConfigItem> = _config.asStateFlow()

  override suspend fun signInWithEmail(email: String, password: String): Result<Unit> = Result.success(Unit)
  override suspend fun signInWithGoogleIdToken(idToken: String): Result<Unit> = Result.success(Unit)
  override fun signOut() {
    _sessionState.value = AdminSessionState.Unauthenticated
  }

  override suspend fun updateMechanicStatus(
    mechanicId: String,
    newStatus: MechanicApprovalStatus,
    reason: String?
  ): Result<Unit> {
    _mechanics.value = _mechanics.value.map { m ->
      if (m.id == mechanicId) {
        m.copy(
          approvalStatus = newStatus,
          isOnline = if (newStatus != MechanicApprovalStatus.APPROVED) false else m.isOnline
        )
      } else m
    }
    _auditLogs.value = listOf(
      AuditLogItem(
        id = "LOG_${System.currentTimeMillis()}",
        action = "MECHANIC_STATUS_${newStatus.name}",
        admin = "admin@fixmechanic.in",
        targetType = "MECHANIC",
        targetId = mechanicId,
        details = reason ?: "Updated to ${newStatus.name}"
      )
    ) + _auditLogs.value
    return Result.success(Unit)
  }

  override suspend fun commitCsvImport(mechanics: List<MechanicItem>): Result<Int> {
    _mechanics.value = mechanics + _mechanics.value
    return Result.success(mechanics.size)
  }

  override suspend fun simulateRequest(vehicleType: String, category: String, address: String): Result<String> {
    val reqId = "REQ-${100 + _requests.value.size}"
    val candidate = _mechanics.value.firstOrNull {
      it.approvalStatus == MechanicApprovalStatus.APPROVED && it.isOnline && !it.isBusy
    }
    val req = ServiceRequestItem(
      id = reqId,
      customerName = "Test Customer",
      customerPhone = "9810000000",
      vehicleType = vehicleType,
      vehicleRegNumber = "HR26-TS-0001",
      serviceCategory = category,
      status = if (candidate != null) ServiceRequestStatus.ASSIGNED else ServiceRequestStatus.SEARCHING,
      assignedMechanicId = candidate?.id,
      assignedMechanicName = candidate?.name,
      address = address
    )
    _requests.value = listOf(req) + _requests.value
    return Result.success(reqId)
  }

  override suspend fun cancelRequest(requestId: String, reason: String): Result<Unit> {
    _requests.value = _requests.value.map { r ->
      if (r.id == requestId) r.copy(status = ServiceRequestStatus.CANCELLED) else r
    }
    return Result.success(Unit)
  }

  override suspend fun reassignRequest(requestId: String): Result<Unit> {
    _requests.value = _requests.value.map { r ->
      if (r.id == requestId) {
        r.copy(
          status = ServiceRequestStatus.SEARCHING,
          assignedMechanicId = null,
          assignedMechanicName = null,
          dispatchBatch = r.dispatchBatch + 1
        )
      } else r
    }
    return Result.success(Unit)
  }

  override suspend fun updateConfig(radius: Double, batchSize: Int, timeoutSec: Int): Result<Unit> {
    _config.value = _config.value.copy(
      defaultSearchRadiusKm = radius,
      initialOfferBatchSize = batchSize,
      offerTimeoutSeconds = timeoutSec
    )
    return Result.success(Unit)
  }

  override fun dispose() {}
}
