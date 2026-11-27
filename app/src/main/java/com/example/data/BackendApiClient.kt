package com.example.data

import com.example.BuildConfig
import com.example.data.FirestoreProvider.awaitResult
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class BackendApiClient(
  private val auth: FirebaseAuth?,
  private val baseUrl: String = BuildConfig.BACKEND_BASE_URL,
  private val httpClient: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .build()
) {
  suspend fun callFunction(functionName: String, data: JSONObject): JSONObject {
    val currentUser = auth?.currentUser
      ?: throw IllegalStateException("Admin authentication required before calling $functionName.")
    val tokenResult = currentUser.getIdToken(false).awaitResult()
    val idToken = tokenResult.token
      ?: throw IllegalStateException("Missing Firebase ID token for admin call.")

    return withContext(Dispatchers.IO) {
      val cleanBase = baseUrl.trimEnd('/')
      val envelope = JSONObject().put("data", data)
      val body = envelope.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
      val request = Request.Builder()
        .url("$cleanBase/$functionName")
        .addHeader("Authorization", "Bearer $idToken")
        .addHeader("Content-Type", "application/json")
        .post(body)
        .build()

      httpClient.newCall(request).execute().use { response ->
        val raw = response.body?.string().orEmpty()
        val parsed = runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
        if (!response.isSuccessful) {
          val errMsg = parsed.optJSONObject("error")?.optString("message")
            ?.takeIf { it.isNotBlank() }
            ?: "Backend call /$functionName failed (HTTP ${response.code})."
          throw IllegalStateException(errMsg)
        }
        parsed.optJSONObject("result") ?: parsed
      }
    }
  }
}
