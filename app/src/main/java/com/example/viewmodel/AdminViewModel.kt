package com.example.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AdminViewModel : ViewModel() {

  private val _mechanics = MutableStateFlow<List<MechanicItem>>(emptyList())
  val mechanics: StateFlow<List<MechanicItem>> = _mechanics.asStateFlow()

  private val _requests = MutableStateFlow<List<ServiceRequestItem>>(emptyList())
  val requests: StateFlow<List<ServiceRequestItem>> = _requests.asStateFlow()

  private val _auditLogs = MutableStateFlow<List<AuditLogItem>>(emptyList())
  val auditLogs: StateFlow<List<AuditLogItem>> = _auditLogs.asStateFlow()

  private val _config = MutableStateFlow(DispatchConfigItem())
  val config: StateFlow<DispatchConfigItem> = _config.asStateFlow()

  private val _statusMessage = MutableStateFlow<String?>(null)
  val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

  init {
    loadSeedData()
  }

  private fun loadSeedData() {
    val now = System.currentTimeMillis()
    _mechanics.value = listOf(
      MechanicItem(
        id = "mech_101",
        name = "Rajesh Sharma",
        phone = "9810123401",
        email = "rajesh.sharma@example.com",
        approvalStatus = MechanicApprovalStatus.APPROVED,
        isOnline = true,
        isBusy = false,
        vehicleTypes = listOf("TWO_WHEELER", "FOUR_WHEELER_CAR"),
        serviceCategories = listOf("FLAT_TYRE", "BATTERY_JUMPSTART", "MINOR_MECHANICAL"),
        address = "Sector 29 Gurugram",
        lat = 28.4682,
        lng = 77.0617,
        rating = 4.8,
        ratingCount = 34
      ),
      MechanicItem(
        id = "mech_102",
        name = "Amit Kumar",
        phone = "9810123402",
        email = "amit.kumar@example.com",
        approvalStatus = MechanicApprovalStatus.PENDING,
        isOnline = false,
        isBusy = false,
        vehicleTypes = listOf("TWO_WHEELER", "FOUR_WHEELER_CAR", "EV_TWO_WHEELER"),
        serviceCategories = listOf("FLAT_TYRE", "BATTERY_JUMPSTART", "LOCKOUT"),
        address = "DLF Phase 4 Gurugram",
        lat = 28.4725,
        lng = 77.0850,
        rating = 5.0,
        ratingCount = 0
      ),
      MechanicItem(
        id = "mech_103",
        name = "Vikas Yadav",
        phone = "9810123403",
        email = "vikas.yadav@example.com",
        approvalStatus = MechanicApprovalStatus.APPROVED,
        isOnline = true,
        isBusy = true,
        activeJobId = "REQ-901",
        vehicleTypes = listOf("FOUR_WHEELER_CAR", "COMMERCIAL_LIGHT"),
        serviceCategories = listOf("TOWING", "BATTERY_JUMPSTART"),
        address = "Sohna Road Gurugram",
        lat = 28.4231,
        lng = 77.0428,
        rating = 4.9,
        ratingCount = 52
      ),
      MechanicItem(
        id = "mech_104",
        name = "Sunil Verma",
        phone = "9810123404",
        email = "sunil.verma@example.com",
        approvalStatus = MechanicApprovalStatus.PENDING,
        isOnline = false,
        isBusy = false,
        vehicleTypes = listOf("TWO_WHEELER", "EV_TWO_WHEELER"),
        serviceCategories = listOf("FLAT_TYRE", "BATTERY_JUMPSTART", "FUEL_DELIVERY"),
        address = "Sector 14 Gurugram",
        lat = 28.4750,
        lng = 77.0392,
        rating = 5.0,
        ratingCount = 0
      ),
      MechanicItem(
        id = "mech_105",
        name = "Manoj Saini",
        phone = "9810123405",
        email = "manoj.saini@example.com",
        approvalStatus = MechanicApprovalStatus.SUSPENDED,
        isOnline = false,
        isBusy = false,
        vehicleTypes = listOf("FOUR_WHEELER_CAR", "EV_FOUR_WHEELER"),
        serviceCategories = listOf("BATTERY_JUMPSTART", "LOCKOUT"),
        address = "Golf Course Road",
        lat = 28.4520,
        lng = 77.0980,
        rating = 3.2,
        ratingCount = 18
      ),
      MechanicItem(
        id = "mech_106",
        name = "Deepak Singh",
        phone = "9810123406",
        email = "deepak.singh@example.com",
        approvalStatus = MechanicApprovalStatus.APPROVED,
        isOnline = true,
        isBusy = false,
        vehicleTypes = listOf("TWO_WHEELER", "FOUR_WHEELER_CAR"),
        serviceCategories = listOf("FLAT_TYRE", "TOWING", "MINOR_MECHANICAL"),
        address = "Cyber City Gurugram",
        lat = 28.4950,
        lng = 77.0890,
        rating = 4.7,
        ratingCount = 41
      )
    )

    _requests.value = listOf(
      ServiceRequestItem(
        id = "REQ-901",
        customerName = "Ananya Gupta",
        customerPhone = "9811223344",
        vehicleType = "FOUR_WHEELER_CAR",
        vehicleRegNumber = "HR26-DK-4819",
        serviceCategory = "BATTERY_JUMPSTART",
        status = ServiceRequestStatus.EN_ROUTE,
        assignedMechanicId = "mech_103",
        assignedMechanicName = "Vikas Yadav",
        dispatchBatch = 1,
        searchRadiusKm = 5.0,
        address = "Near Signature Tower, South City 1",
        createdAt = now - 15 * 60 * 1000,
        timeline = listOf(
          TimelineEventItem("REQUESTED", "SEARCHING", "CUSTOMER", now - 15 * 60 * 1000),
          TimelineEventItem("SEARCHING", "ASSIGNED", "SYSTEM (Atomic Lock)", now - 14 * 60 * 1000),
          TimelineEventItem("ASSIGNED", "ACCEPTED", "MECHANIC", now - 13 * 60 * 1000),
          TimelineEventItem("ACCEPTED", "EN_ROUTE", "MECHANIC", now - 10 * 60 * 1000)
        )
      ),
      ServiceRequestItem(
        id = "REQ-902",
        customerName = "Rahul Sen",
        customerPhone = "9899112233",
        vehicleType = "TWO_WHEELER",
        vehicleRegNumber = "DL03-EM-9921",
        serviceCategory = "FLAT_TYRE",
        status = ServiceRequestStatus.COMPLETED,
        assignedMechanicId = "mech_101",
        assignedMechanicName = "Rajesh Sharma",
        dispatchBatch = 1,
        searchRadiusKm = 5.0,
        address = "HUDA Metro Station Gate 2",
        createdAt = now - 65 * 60 * 1000,
        timeline = listOf(
          TimelineEventItem("REQUESTED", "SEARCHING", "CUSTOMER", now - 65 * 60 * 1000),
          TimelineEventItem("SEARCHING", "ASSIGNED", "SYSTEM", now - 64 * 60 * 1000),
          TimelineEventItem("ASSIGNED", "ACCEPTED", "MECHANIC", now - 63 * 60 * 1000),
          TimelineEventItem("ACCEPTED", "EN_ROUTE", "MECHANIC", now - 60 * 60 * 1000),
          TimelineEventItem("EN_ROUTE", "ARRIVED", "MECHANIC", now - 45 * 60 * 1000),
          TimelineEventItem("ARRIVED", "IN_PROGRESS", "MECHANIC", now - 42 * 60 * 1000),
          TimelineEventItem("IN_PROGRESS", "COMPLETED", "MECHANIC", now - 20 * 60 * 1000)
        )
      )
    )

    _auditLogs.value = listOf(
      AuditLogItem(
        id = "LOG_001",
        action = "SYSTEM_INITIALIZATION",
        admin = "SYSTEM",
        targetType = "SYSTEM_CONFIG",
        targetId = "pilot_gurugram",
        details = "Sector 29 Gurugram pilot zone online with 5km default radius.",
        timestamp = now - 2 * 3600 * 1000
      ),
      AuditLogItem(
        id = "LOG_002",
        action = "MECHANIC_STATUS_SUSPENDED",
        admin = "admin@fixmechanic.in",
        targetType = "MECHANIC",
        targetId = "mech_105",
        details = "Manoj Saini suspended due to repeated unconfirmed dispatch cancellations.",
        timestamp = now - 1 * 3600 * 1000
      )
    )
  }

  fun updateMechanicStatus(mechanicId: String, newStatus: MechanicApprovalStatus, reason: String? = null) {
    val list = _mechanics.value.map { m ->
      if (m.id == mechanicId) {
        m.copy(
          approvalStatus = newStatus,
          isOnline = if (newStatus != MechanicApprovalStatus.APPROVED) false else m.isOnline
        )
      } else m
    }
    _mechanics.value = list

    addAuditLog(
      action = "MECHANIC_STATUS_${newStatus.name}",
      targetType = "MECHANIC",
      targetId = mechanicId,
      details = reason ?: "Admin updated status to ${newStatus.name}"
    )
    _statusMessage.value = "Mechanic status updated to ${newStatus.name}"
  }

  fun parseAndValidateCsv(csvText: String): CsvParseResult {
    val lines = csvText.lines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }
    if (lines.size < 2) {
      return CsvParseResult(0, emptyList(), listOf(Pair(0, "CSV must contain header and data rows")), 0)
    }

    val validRows = mutableListOf<MechanicItem>()
    val invalidRows = mutableListOf<Pair<Int, String>>()
    val seenPhones = mutableSetOf<String>()
    val existingPhones = _mechanics.value.map { it.phone.filter { ch -> ch.isDigit() } }.toSet()
    var duplicateCount = 0

    for (i in 1 until lines.size) {
      val cols = parseCsvLine(lines[i])
      val name = cols.getOrNull(0) ?: ""
      val rawPhone = cols.getOrNull(1) ?: ""
      val phoneDigits = rawPhone.filter { it.isDigit() }
      val email = cols.getOrNull(2)
      val vTypesStr = cols.getOrNull(3) ?: "TWO_WHEELER,FOUR_WHEELER_CAR"
      val servicesStr = cols.getOrNull(4) ?: "FLAT_TYRE"
      val locality = cols.getOrNull(5) ?: "Sector 29 Gurugram"

      val errors = mutableListOf<String>()
      if (name.length < 2) errors.add("Invalid name")
      if (phoneDigits.length < 10) errors.add("Invalid phone number ($rawPhone)")

      if (existingPhones.contains(phoneDigits)) {
        errors.add("Already registered in system ($phoneDigits)")
        duplicateCount++
      } else if (seenPhones.contains(phoneDigits)) {
        errors.add("Duplicate phone in batch ($phoneDigits)")
        duplicateCount++
      } else {
        seenPhones.add(phoneDigits)
      }

      if (errors.isNotEmpty()) {
        invalidRows.add(Pair(i, "$name: ${errors.joinToString(", ")}"))
      } else {
        validRows.add(
          MechanicItem(
            id = "mech_csv_${phoneDigits.takeLast(6)}_${(10..99).random()}",
            name = name,
            phone = phoneDigits,
            email = email,
            approvalStatus = MechanicApprovalStatus.PENDING, // Always starts in PENDING!
            isOnline = false,
            isBusy = false,
            vehicleTypes = vTypesStr.split(",").map { it.trim() },
            serviceCategories = servicesStr.split(",").map { it.trim() },
            address = locality,
            lat = 28.4595 + (Math.random() - 0.5) * 0.05,
            lng = 77.0266 + (Math.random() - 0.5) * 0.05,
            rating = 5.0,
            ratingCount = 0
          )
        )
      }
    }

    return CsvParseResult(
      totalRows = lines.size - 1,
      validRows = validRows,
      invalidRows = invalidRows,
      duplicateCount = duplicateCount
    )
  }

  fun commitCsvImport(validRows: List<MechanicItem>) {
    if (validRows.isEmpty()) return
    _mechanics.value = validRows + _mechanics.value
    addAuditLog(
      action = "CSV_MECHANICS_IMPORTED",
      targetType = "MECHANIC",
      targetId = "BATCH_IMPORT",
      details = "Imported ${validRows.size} mechanics in PENDING status."
    )
    _statusMessage.value = "Imported ${validRows.size} mechanics awaiting verification."
  }

  fun simulateRequest(vehicleType: String, serviceCategory: String, address: String) {
    val reqId = "REQ-${(100..999).random()}"
    val now = System.currentTimeMillis()

    // Find nearest approved & online mechanic
    val candidate = _mechanics.value.firstOrNull {
      it.approvalStatus == MechanicApprovalStatus.APPROVED && it.isOnline && !it.isBusy
    }

    val updatedMechanics = _mechanics.value.map { m ->
      if (candidate != null && m.id == candidate.id) {
        m.copy(isBusy = true, activeJobId = reqId)
      } else m
    }
    _mechanics.value = updatedMechanics

    val timeline = mutableListOf(
      TimelineEventItem("REQUESTED", "SEARCHING", "CUSTOMER", now)
    )
    if (candidate != null) {
      timeline.add(TimelineEventItem("SEARCHING", "ASSIGNED", "SYSTEM (Atomic Lock Transaction)", now + 1000))
    }

    val newReq = ServiceRequestItem(
      id = reqId,
      customerName = "Test Driver (${(10..99).random()})",
      customerPhone = "9812345678",
      vehicleType = vehicleType,
      vehicleRegNumber = "HR26-XY-${(1000..9999).random()}",
      serviceCategory = serviceCategory,
      status = if (candidate != null) ServiceRequestStatus.ASSIGNED else ServiceRequestStatus.SEARCHING,
      assignedMechanicId = candidate?.id,
      assignedMechanicName = candidate?.name,
      dispatchBatch = 1,
      searchRadiusKm = _config.value.defaultSearchRadiusKm,
      address = address,
      createdAt = now,
      timeline = timeline
    )

    _requests.value = listOf(newReq) + _requests.value
    addAuditLog(
      action = if (candidate != null) "JOB_ATOMICALLY_ASSIGNED" else "DISPATCH_STARTED",
      targetType = "SERVICE_REQUEST",
      targetId = reqId,
      details = if (candidate != null) "Assigned to winner ${candidate.name} (${candidate.id})" else "Searching candidates in 5km"
    )
    _statusMessage.value = "Dispatched breakdown incident #$reqId"
  }

  fun cancelRequest(requestId: String, reason: String = "Admin emergency cancellation") {
    val now = System.currentTimeMillis()
    var assignedMechId: String? = null

    val updatedRequests = _requests.value.map { r ->
      if (r.id == requestId) {
        assignedMechId = r.assignedMechanicId
        val tl = r.timeline + TimelineEventItem(r.status.name, "CANCELLED", "ADMIN", now)
        r.copy(status = ServiceRequestStatus.CANCELLED, timeline = tl)
      } else r
    }
    _requests.value = updatedRequests

    if (assignedMechId != null) {
      _mechanics.value = _mechanics.value.map { m ->
        if (m.id == assignedMechId) m.copy(isBusy = false, activeJobId = null) else m
      }
    }

    addAuditLog("ADMIN_CANCEL_REQUEST", "SERVICE_REQUEST", requestId, reason)
    _statusMessage.value = "Request #$requestId cancelled by admin"
  }

  fun reassignRequest(requestId: String) {
    val now = System.currentTimeMillis()
    var prevMechId: String? = null

    val updatedRequests = _requests.value.map { r ->
      if (r.id == requestId) {
        prevMechId = r.assignedMechanicId
        val tl = r.timeline + TimelineEventItem("ASSIGNED", "SEARCHING", "ADMIN (Emergency Reassignment)", now)
        r.copy(
          status = ServiceRequestStatus.SEARCHING,
          assignedMechanicId = null,
          assignedMechanicName = null,
          dispatchBatch = r.dispatchBatch + 1,
          timeline = tl
        )
      } else r
    }
    _requests.value = updatedRequests

    if (prevMechId != null) {
      _mechanics.value = _mechanics.value.map { m ->
        if (m.id == prevMechId) m.copy(isBusy = false, activeJobId = null) else m
      }
    }

    addAuditLog("ADMIN_REASSIGN_REQUEST", "SERVICE_REQUEST", requestId, "Reopened for candidate dispatch")
    _statusMessage.value = "Request #$requestId reopened for dispatch"
  }

  fun updateConfig(radius: Double, batchSize: Int, timeoutSec: Int) {
    _config.value = _config.value.copy(
      defaultSearchRadiusKm = radius,
      initialOfferBatchSize = batchSize,
      offerTimeoutSeconds = timeoutSec
    )
    addAuditLog("CONFIG_UPDATED", "SYSTEM_CONFIG", "pilot_gurugram", "Radius: ${radius}km, Batch: $batchSize")
    _statusMessage.value = "Operational configuration updated."
  }

  fun clearStatusMessage() {
    _statusMessage.value = null
  }

  private fun addAuditLog(action: String, targetType: String, targetId: String, details: String) {
    val log = AuditLogItem(
      id = "LOG_${System.currentTimeMillis()}",
      action = action,
      admin = "admin@fixmechanic.in",
      targetType = targetType,
      targetId = targetId,
      details = details,
      timestamp = System.currentTimeMillis()
    )
    _auditLogs.value = listOf(log) + _auditLogs.value
  }

  private fun parseCsvLine(line: String): List<String> {
    val result = mutableListOf<String>()
    var cur = StringBuilder()
    var inQuotes = false
    for (ch in line) {
      when {
        ch == '"' -> inQuotes = !inQuotes
        ch == ',' && !inQuotes -> {
          result.add(cur.toString().trim())
          cur = StringBuilder()
        }
        else -> cur.append(ch)
      }
    }
    result.add(cur.toString().trim())
    return result
  }
}
