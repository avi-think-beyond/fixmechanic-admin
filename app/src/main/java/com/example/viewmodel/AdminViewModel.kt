package com.example.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.data.AdminRepository
import com.example.model.AdminSessionState
import com.example.model.AuditLogItem
import com.example.model.CsvParseResult
import com.example.model.DispatchConfigItem
import com.example.model.MechanicApprovalStatus
import com.example.model.MechanicItem
import com.example.model.ServiceRequestItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AdminViewModel(
  private val repository: AdminRepository
) : ViewModel() {

  val sessionState: StateFlow<AdminSessionState> = repository.sessionState
  val mechanics: StateFlow<List<MechanicItem>> = repository.mechanics
  val requests: StateFlow<List<ServiceRequestItem>> = repository.requests
  val auditLogs: StateFlow<List<AuditLogItem>> = repository.auditLogs
  val config: StateFlow<DispatchConfigItem> = repository.config

  private val _statusMessage = MutableStateFlow<String?>(null)
  val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

  fun signInWithEmail(email: String, password: String) {
    viewModelScope.launch {
      repository.signInWithEmail(email, password)
        .onFailure { _statusMessage.value = "Sign-in failed: ${it.message}" }
    }
  }

  fun signInWithGoogleToken(idToken: String) {
    viewModelScope.launch {
      repository.signInWithGoogleIdToken(idToken)
        .onFailure { _statusMessage.value = "Google sign-in failed: ${it.message}" }
    }
  }

  fun signOut() {
    repository.signOut()
  }

  fun updateMechanicStatus(mechanicId: String, newStatus: MechanicApprovalStatus, reason: String? = null) {
    viewModelScope.launch {
      repository.updateMechanicStatus(mechanicId, newStatus, reason)
        .onSuccess { _statusMessage.value = "Mechanic status updated to ${newStatus.name}" }
        .onFailure { _statusMessage.value = "Error: ${it.message}" }
    }
  }

  fun parseAndValidateCsv(csvText: String): CsvParseResult {
    val lines = csvText.lines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }
    if (lines.size < 2) {
      return CsvParseResult(0, emptyList(), listOf(Pair(0, "CSV must contain header and data rows")), 0)
    }

    val validRows = mutableListOf<MechanicItem>()
    val invalidRows = mutableListOf<Pair<Int, String>>()
    val seenPhones = mutableSetOf<String>()
    val existingPhones = mechanics.value.map { it.phone.filter { ch -> ch.isDigit() }.takeLast(10) }.toSet()
    var duplicateCount = 0

    for (i in 1 until lines.size) {
      val cols = parseCsvLine(lines[i])
      val name = cols.getOrNull(0) ?: ""
      val rawPhone = cols.getOrNull(1) ?: ""
      val digits = rawPhone.filter { it.isDigit() }
      val phoneDigits = if (digits.length > 10) digits.takeLast(10) else digits
      val email = cols.getOrNull(2)
      val vTypesStr = cols.getOrNull(3) ?: "TWO_WHEELER,FOUR_WHEELER_CAR"
      val servicesStr = cols.getOrNull(4) ?: "FLAT_TYRE"
      val locality = cols.getOrNull(5) ?: "Sector 29 Gurugram"
      val lat = cols.getOrNull(6)?.toDoubleOrNull() ?: 28.4595
      val lng = cols.getOrNull(7)?.toDoubleOrNull() ?: 77.0266

      val errors = mutableListOf<String>()
      if (name.length < 2) errors.add("Invalid name")
      if (phoneDigits.length < 10) errors.add("Invalid phone number ($rawPhone)")
      if (existingPhones.contains(phoneDigits)) {
        errors.add("Already registered in system ($phoneDigits)")
        duplicateCount++
      } else if (seenPhones.contains(phoneDigits)) {
        errors.add("Duplicate phone in batch ($phoneDigits)")
        duplicateCount++
      } else if (phoneDigits.length == 10) {
        seenPhones.add(phoneDigits)
      }

      if (errors.isNotEmpty()) {
        invalidRows.add(Pair(i, "Line $i ($name): ${errors.joinToString(", ")}"))
      } else {
        validRows.add(
          MechanicItem(
            id = "mech_csv_${phoneDigits.takeLast(6)}",
            name = name,
            phone = phoneDigits,
            email = email,
            approvalStatus = MechanicApprovalStatus.PENDING,
            isOnline = false,
            isBusy = false,
            vehicleTypes = vTypesStr.split(",").map { it.trim() }.filter { it.isNotEmpty() },
            serviceCategories = servicesStr.split(",").map { it.trim() }.filter { it.isNotEmpty() },
            address = locality,
            lat = lat,
            lng = lng
          )
        )
      }
    }

    return CsvParseResult(lines.size - 1, validRows, invalidRows, duplicateCount)
  }

  fun commitCsvImport(validMechanics: List<MechanicItem>) {
    viewModelScope.launch {
      repository.commitCsvImport(validMechanics)
        .onSuccess { count -> _statusMessage.value = "Imported $count mechanics in PENDING verification status" }
        .onFailure { _statusMessage.value = "CSV import error: ${it.message}" }
    }
  }

  fun simulateRequest(vehicleType: String, category: String, address: String) {
    viewModelScope.launch {
      repository.simulateRequest(vehicleType, category, address)
        .onSuccess { reqId -> _statusMessage.value = "Dispatched request #$reqId via Spark backend" }
        .onFailure { _statusMessage.value = "Dispatch failed: ${it.message}" }
    }
  }

  fun cancelRequest(requestId: String, reason: String = "Admin emergency cancellation") {
    viewModelScope.launch {
      repository.cancelRequest(requestId, reason)
        .onSuccess { _statusMessage.value = "Request #$requestId cancelled by admin" }
        .onFailure { _statusMessage.value = "Cancel failed: ${it.message}" }
    }
  }

  fun reassignRequest(requestId: String) {
    viewModelScope.launch {
      repository.reassignRequest(requestId)
        .onSuccess { _statusMessage.value = "Request #$requestId reopened for dispatch" }
        .onFailure { _statusMessage.value = "Reassign failed: ${it.message}" }
    }
  }

  fun updateConfig(radius: Double, batchSize: Int, timeoutSec: Int) {
    viewModelScope.launch {
      repository.updateConfig(radius, batchSize, timeoutSec)
        .onSuccess { _statusMessage.value = "Operational configuration saved to Firestore." }
        .onFailure { _statusMessage.value = "Config update failed: ${it.message}" }
    }
  }

  fun clearStatusMessage() {
    _statusMessage.value = null
  }

  override fun onCleared() {
    super.onCleared()
    repository.dispose()
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

class AdminViewModelFactory(
  private val repository: AdminRepository
) : ViewModelProvider.Factory {
  @Suppress("UNCHECKED_CAST")
  override fun <T : ViewModel> create(modelClass: Class<T>): T {
    if (modelClass.isAssignableFrom(AdminViewModel::class.java)) {
      return AdminViewModel(repository) as T
    }
    throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
  }
}
