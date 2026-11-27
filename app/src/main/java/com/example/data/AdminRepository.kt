package com.example.data

import android.content.Context
import android.util.Log
import com.example.data.FirestoreProvider.awaitResult
import com.example.model.AdminSessionState
import com.example.model.AuditLogItem
import com.example.model.DispatchConfigItem
import com.example.model.MechanicApprovalStatus
import com.example.model.MechanicItem
import com.example.model.ServiceRequestItem
import com.example.model.ServiceRequestStatus
import com.example.model.TimelineEventItem
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

interface AdminRepository {
  val sessionState: StateFlow<AdminSessionState>
  val mechanics: StateFlow<List<MechanicItem>>
  val requests: StateFlow<List<ServiceRequestItem>>
  val auditLogs: StateFlow<List<AuditLogItem>>
  val config: StateFlow<DispatchConfigItem>

  suspend fun signInWithEmail(email: String, password: String): Result<Unit>
  suspend fun signInWithGoogleIdToken(idToken: String): Result<Unit>
  fun signOut()

  suspend fun updateMechanicStatus(
    mechanicId: String,
    newStatus: MechanicApprovalStatus,
    reason: String? = null
  ): Result<Unit>

  suspend fun commitCsvImport(mechanics: List<MechanicItem>): Result<Int>
  suspend fun simulateRequest(vehicleType: String, category: String, address: String): Result<String>
  suspend fun cancelRequest(requestId: String, reason: String): Result<Unit>
  suspend fun reassignRequest(requestId: String): Result<Unit>
  suspend fun updateConfig(radius: Double, batchSize: Int, timeoutSec: Int): Result<Unit>
  fun dispose()
}

class FirestoreAdminRepository(
  private val firestore: FirebaseFirestore?,
  private val auth: FirebaseAuth?,
  private val backendApiClient: BackendApiClient?
) : AdminRepository {

  constructor(context: Context) : this(
    firestore = createFirestore(context),
    auth = createAuth(),
    backendApiClient = createBackendApiClient(createAuth())
  )

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val _sessionState = MutableStateFlow<AdminSessionState>(AdminSessionState.Loading)
  override val sessionState: StateFlow<AdminSessionState> = _sessionState.asStateFlow()

  private val _mechanics = MutableStateFlow<List<MechanicItem>>(emptyList())
  override val mechanics: StateFlow<List<MechanicItem>> = _mechanics.asStateFlow()

  private val _requests = MutableStateFlow<List<ServiceRequestItem>>(emptyList())
  override val requests: StateFlow<List<ServiceRequestItem>> = _requests.asStateFlow()

  private val _auditLogs = MutableStateFlow<List<AuditLogItem>>(emptyList())
  override val auditLogs: StateFlow<List<AuditLogItem>> = _auditLogs.asStateFlow()

  private val _config = MutableStateFlow(DispatchConfigItem())
  override val config: StateFlow<DispatchConfigItem> = _config.asStateFlow()

  private val listeners = mutableListOf<ListenerRegistration>()
  private var eventsByRequestId: Map<String, List<TimelineEventItem>> = emptyMap()
  private var rawRequests: List<ServiceRequestItem> = emptyList()

  private val authListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
    val user = firebaseAuth.currentUser
    if (user == null) {
      clearListeners()
      _mechanics.value = emptyList()
      _requests.value = emptyList()
      _auditLogs.value = emptyList()
      _sessionState.value = AdminSessionState.Unauthenticated
    } else {
      scope.launch { verifyAdminAndStartListeners(user) }
    }
  }

  init {
    if (auth == null || firestore == null) {
      _sessionState.value = AdminSessionState.Unauthenticated
    } else {
      auth.addAuthStateListener(authListener)
    }
  }

  private suspend fun verifyAdminAndStartListeners(user: FirebaseUser) {
    _sessionState.value = AdminSessionState.Loading
    try {
      val tokenClaims = runCatching { user.getIdToken(false).awaitResult().claims }.getOrDefault(emptyMap())
      val claimRole = tokenClaims["role"]?.toString()?.uppercase()
      val isClaimAdmin = claimRole == "ADMIN" || tokenClaims["admin"] == true

      val userSnap = firestore?.collection("users")?.document(user.uid)?.get()?.awaitResult()
      val docRole = userSnap?.getString("role")?.uppercase()
      val disabled = userSnap?.getBoolean("disabled") == true

      if (disabled) {
        _sessionState.value = AdminSessionState.Unauthorized(user.email, "Admin account is suspended.")
        clearListeners()
        return
      }
      if (!isClaimAdmin && docRole != "ADMIN") {
        _sessionState.value = AdminSessionState.Unauthorized(
          user.email,
          "Access denied. Account role '${docRole ?: "NONE"}' is not ADMIN."
        )
        clearListeners()
        return
      }

      _sessionState.value = AdminSessionState.Authenticated(
        uid = user.uid,
        email = user.email ?: user.uid,
        displayName = user.displayName ?: "Operations Admin"
      )
      startFirestoreListeners()
    } catch (e: Exception) {
      Log.e(TAG, "Admin verification failed", e)
      _sessionState.value = AdminSessionState.Unauthorized(user.email, e.message ?: "Admin verification error")
    }
  }

  private fun startFirestoreListeners() {
    clearListeners()
    val db = firestore ?: return

    listeners.add(
      db.collection("mechanicProfiles").addSnapshotListener { snap, err ->
        if (err != null || snap == null) return@addSnapshotListener
        _mechanics.value = snap.documents.mapNotNull(::mapMechanic)
      }
    )

    listeners.add(
      db.collection("serviceRequests")
        .orderBy("createdAt", Query.Direction.DESCENDING)
        .addSnapshotListener { snap, err ->
          if (err != null || snap == null) return@addSnapshotListener
          rawRequests = snap.documents.mapNotNull(::mapRequest)
          publishRequestsWithTimelines()
        }
    )

    listeners.add(
      db.collection("jobStatusEvents")
        .orderBy("timestamp", Query.Direction.ASCENDING)
        .addSnapshotListener { snap, err ->
          if (err != null || snap == null) return@addSnapshotListener
          eventsByRequestId = snap.documents.mapNotNull { doc ->
            val reqId = doc.getString("requestId") ?: return@mapNotNull null
            reqId to TimelineEventItem(
              fromStatus = doc.getString("fromStatus") ?: "NONE",
              toStatus = doc.getString("toStatus") ?: "UNKNOWN",
              actor = doc.getString("actorRole") ?: doc.getString("actorId") ?: "SYSTEM",
              timestamp = extractEpochMillis(doc.get("timestamp"))
            )
          }.groupBy({ it.first }, { it.second })
          publishRequestsWithTimelines()
        }
    )

    listeners.add(
      db.collection("adminAuditLogs")
        .orderBy("timestamp", Query.Direction.DESCENDING)
        .limit(100)
        .addSnapshotListener { snap, err ->
          if (err != null || snap == null) return@addSnapshotListener
          _auditLogs.value = snap.documents.mapNotNull(::mapAuditLog)
        }
    )

    listeners.add(
      db.collection("applicationConfig").document("current").addSnapshotListener { doc, err ->
        if (err != null || doc == null || !doc.exists()) return@addSnapshotListener
        _config.value = DispatchConfigItem(
          defaultSearchRadiusKm = doc.getDouble("defaultSearchRadiusKm") ?: 5.0,
          maxSearchRadiusKm = doc.getDouble("maxSearchRadiusKm") ?: 15.0,
          initialOfferBatchSize = (doc.getLong("initialOfferBatchSize") ?: 3L).toInt(),
          offerTimeoutSeconds = (doc.getLong("offerTimeoutSeconds") ?: 45L).toInt(),
          maxDispatchRetries = (doc.getLong("maxMechanicDispatchAttempts") ?: 3L).toInt(),
          maxStalenessMinutes = (doc.getLong("maxMechanicLocationStalenessMinutes") ?: 20L).toInt(),
          localityName = doc.getString("localityName") ?: "Gurugram (Sector 29 Pilot Zone)"
        )
      }
    )
  }

  private fun publishRequestsWithTimelines() {
    _requests.value = rawRequests.map { req ->
      req.copy(timeline = eventsByRequestId[req.id].orEmpty())
    }
  }

  override suspend fun signInWithEmail(email: String, password: String): Result<Unit> = runCatching {
    val firebaseAuth = auth ?: error("FirebaseAuth unavailable")
    firebaseAuth.signInWithEmailAndPassword(email.trim(), password).awaitResult()
  }

  override suspend fun signInWithGoogleIdToken(idToken: String): Result<Unit> = runCatching {
    val firebaseAuth = auth ?: error("FirebaseAuth unavailable")
    val credential = GoogleAuthProvider.getCredential(idToken, null)
    firebaseAuth.signInWithCredential(credential).awaitResult()
  }

  override fun signOut() {
    clearListeners()
    auth?.signOut()
  }

  override suspend fun updateMechanicStatus(
    mechanicId: String,
    newStatus: MechanicApprovalStatus,
    reason: String?
  ): Result<Unit> = runCatching {
    val api = backendApiClient ?: error("BackendApiClient unavailable")
    val payload = JSONObject()
      .put("mechanicId", mechanicId)
      .put("targetStatus", newStatus.name)
      .put("reason", reason ?: "Admin updated status to ${newStatus.name}")
    api.callFunction("updateMechanicStatus", payload)
  }

  override suspend fun commitCsvImport(mechanics: List<MechanicItem>): Result<Int> = runCatching {
    val api = backendApiClient ?: error("BackendApiClient unavailable")
    val rowsArray = JSONArray()
    mechanics.forEach { mech ->
      rowsArray.put(
        JSONObject()
          .put("name", mech.name)
          .put("phone", mech.phone)
          .put("email", mech.email ?: "")
          .put("vehicleTypes", mech.vehicleTypes.joinToString(","))
          .put("serviceCategories", mech.serviceCategories.joinToString(","))
          .put("locality", mech.address)
          .put("lat", mech.lat)
          .put("lng", mech.lng)
      )
    }
    val payload = JSONObject().put("rows", rowsArray).put("commit", true)
    val result = api.callFunction("processMechanicsCsv", payload)
    result.optInt("importedCount", mechanics.size)
  }

  override suspend fun simulateRequest(
    vehicleType: String,
    category: String,
    address: String
  ): Result<String> = runCatching {
    val api = backendApiClient ?: error("BackendApiClient unavailable")
    val cfg = _config.value
    val payload = JSONObject()
      .put("vehicleType", vehicleType)
      .put("serviceCategory", category)
      .put("issueTitle", category.replace("_", " "))
      .put("address", address.ifBlank { cfg.localityName })
      .put("lat", 28.4595)
      .put("lng", 77.0266)
    val res = api.callFunction("createServiceRequest", payload)
    res.optString("requestId", "UNKNOWN")
  }

  override suspend fun cancelRequest(requestId: String, reason: String): Result<Unit> = runCatching {
    val api = backendApiClient ?: error("BackendApiClient unavailable")
    val payload = JSONObject()
      .put("requestId", requestId)
      .put("action", "CANCEL")
      .put("reason", reason)
    api.callFunction("adminCancelOrReassign", payload)
  }

  override suspend fun reassignRequest(requestId: String): Result<Unit> = runCatching {
    val api = backendApiClient ?: error("BackendApiClient unavailable")
    val payload = JSONObject()
      .put("requestId", requestId)
      .put("action", "REASSIGN")
      .put("reason", "Admin emergency reassignment via Android Console")
    api.callFunction("adminCancelOrReassign", payload)
  }

  override suspend fun updateConfig(radius: Double, batchSize: Int, timeoutSec: Int): Result<Unit> = runCatching {
    val api = backendApiClient ?: error("BackendApiClient unavailable")
    val payload = JSONObject()
      .put("defaultSearchRadiusKm", radius)
      .put("initialOfferBatchSize", batchSize)
      .put("offerTimeoutSeconds", timeoutSec)
    api.callFunction("updateApplicationConfig", payload)
  }

  override fun dispose() {
    clearListeners()
    auth?.removeAuthStateListener(authListener)
  }

  private fun clearListeners() {
    listeners.forEach { it.remove() }
    listeners.clear()
  }

  private fun mapMechanic(doc: DocumentSnapshot): MechanicItem? {
    val loc = doc.get("currentLocation") as? Map<*, *>
    val vTypes = (doc.get("vehicleTypes") as? List<*>)?.mapNotNull { it?.toString() }.orEmpty()
    val sCats = (doc.get("serviceCategories") as? List<*>)?.mapNotNull { it?.toString() }.orEmpty()
    val approval = runCatching {
      MechanicApprovalStatus.valueOf((doc.getString("approvalStatus") ?: "PENDING").uppercase())
    }.getOrDefault(MechanicApprovalStatus.PENDING)
    return MechanicItem(
      id = doc.getString("mechanicId") ?: doc.id,
      name = doc.getString("name") ?: "Mechanic",
      phone = doc.getString("phone") ?: "",
      email = doc.getString("email"),
      approvalStatus = approval,
      isOnline = doc.getBoolean("isOnline") == true,
      isBusy = doc.getBoolean("isBusy") == true,
      activeJobId = doc.getString("activeJobId"),
      vehicleTypes = vTypes,
      serviceCategories = sCats,
      address = loc?.get("address")?.toString() ?: "Gurugram Pilot Zone",
      lat = (loc?.get("lat") as? Number)?.toDouble() ?: 28.4595,
      lng = (loc?.get("lng") as? Number)?.toDouble() ?: 77.0266,
      rating = doc.getDouble("ratingAverage") ?: 5.0,
      ratingCount = (doc.getLong("ratingCount") ?: 0L).toInt()
    )
  }

  private fun mapRequest(doc: DocumentSnapshot): ServiceRequestItem? {
    val loc = doc.get("location") as? Map<*, *>
    val status = runCatching {
      ServiceRequestStatus.valueOf((doc.getString("status") ?: "SEARCHING").uppercase())
    }.getOrDefault(ServiceRequestStatus.SEARCHING)
    return ServiceRequestItem(
      id = doc.getString("id") ?: doc.id,
      customerName = doc.getString("customerName") ?: "Customer",
      customerPhone = doc.getString("customerPhone") ?: "",
      vehicleType = doc.getString("vehicleType") ?: "FOUR_WHEELER_CAR",
      vehicleRegNumber = doc.getString("vehicleRegNumber") ?: "UNREGISTERED",
      serviceCategory = doc.getString("serviceCategory") ?: "OTHER",
      status = status,
      assignedMechanicId = doc.getString("assignedMechanicId"),
      assignedMechanicName = doc.getString("assignedMechanicName"),
      dispatchBatch = (doc.getLong("dispatchBatch") ?: 1L).toInt(),
      searchRadiusKm = doc.getDouble("searchRadiusKm") ?: 5.0,
      address = loc?.get("address")?.toString() ?: "Reported GPS Location",
      createdAt = extractEpochMillis(doc.get("createdAt"))
    )
  }

  private fun mapAuditLog(doc: DocumentSnapshot): AuditLogItem? {
    val detailsObj = doc.get("details")
    val detailsText = when (detailsObj) {
      is String -> detailsObj
      is Map<*, *> -> detailsObj.entries.joinToString(", ") { "${it.key}: ${it.value}" }
      else -> detailsObj?.toString().orEmpty()
    }
    return AuditLogItem(
      id = doc.getString("id") ?: doc.id,
      action = doc.getString("action") ?: "ADMIN_EVENT",
      admin = doc.getString("adminEmail") ?: doc.getString("adminId") ?: "SYSTEM",
      targetType = doc.getString("targetType") ?: "SYSTEM",
      targetId = doc.getString("targetId") ?: "",
      details = detailsText,
      timestamp = extractEpochMillis(doc.get("timestamp"))
    )
  }

  private fun extractEpochMillis(raw: Any?): Long {
    return when (raw) {
      is Number -> raw.toLong()
      is Timestamp -> raw.toDate().time
      else -> System.currentTimeMillis()
    }
  }

  companion object {
    private const val TAG = "FirestoreAdminRepo"

    private fun createFirestore(context: Context): FirebaseFirestore? {
      return runCatching { FirestoreProvider.createFirestore(context) }.getOrNull()
    }

    private fun createAuth(): FirebaseAuth? {
      return runCatching { FirebaseAuth.getInstance() }.getOrNull()
    }

    private fun createBackendApiClient(auth: FirebaseAuth?): BackendApiClient? {
      return runCatching { BackendApiClient(auth) }.getOrNull()
    }
  }
}
