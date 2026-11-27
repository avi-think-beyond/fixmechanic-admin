package com.example

import com.example.base.FirestoreEmulatorTestBase
import com.example.data.BackendApiClient
import com.example.data.FirestoreAdminRepository
import com.example.data.FirestoreProvider.awaitResult
import com.example.model.AdminSessionState
import com.example.model.MechanicApprovalStatus
import com.example.model.MechanicItem
import com.example.model.ServiceRequestStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume
import org.junit.Test
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class AdminRepositoryRuleTest : FirestoreEmulatorTestBase() {

  private fun seedUserDocViaEmulatorRest(uid: String, role: String, email: String) {
    val url = URL(
      "http://127.0.0.1:$firestorePort/v1/projects/$projectId/databases/(default)/documents/users?documentId=$uid"
    )
    (url.openConnection() as HttpURLConnection).run {
      requestMethod = "POST"
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer owner")
      doOutput = true
      OutputStreamWriter(outputStream).use { w ->
        w.write(
          """{"fields":{"uid":{"stringValue":"$uid"},"role":{"stringValue":"$role"},"email":{"stringValue":"$email"},"disabled":{"booleanValue":false}}}"""
        )
      }
      responseCode
      disconnect()
    }
  }

  private fun seedPendingMechanicViaEmulatorRest(uid: String, name: String) {
    val url = URL(
      "http://127.0.0.1:$firestorePort/v1/projects/$projectId/databases/(default)/documents/mechanicProfiles?documentId=$uid"
    )
    (url.openConnection() as HttpURLConnection).run {
      requestMethod = "POST"
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer owner")
      doOutput = true
      OutputStreamWriter(outputStream).use { w ->
        w.write(
          """{"fields":{"mechanicId":{"stringValue":"$uid"},"name":{"stringValue":"$name"},"phone":{"stringValue":"9810998877"},"approvalStatus":{"stringValue":"PENDING"},"isOnline":{"booleanValue":false},"isBusy":{"booleanValue":false},"vehicleTypes":{"arrayValue":{"values":[{"stringValue":"TWO_WHEELER"}]}},"serviceCategories":{"arrayValue":{"values":[{"stringValue":"FLAT_TYRE"}]}},"currentLocation":{"mapValue":{"fields":{"lat":{"doubleValue":28.46},"lng":{"doubleValue":77.03},"address":{"stringValue":"Sector 29"}}}}}}"""
        )
      }
      responseCode
      disconnect()
    }
  }

  @Test
  fun `non-admin user is denied admin session state`() = runBlocking(Dispatchers.IO) {
    Assume.assumeTrue("Emulators & Spark backend must run on 8085/9099/5055", areEmulatorsRunning())
    withTimeout(10000L) {
      val cred = auth.createUserWithEmailAndPassword("cust_only@fix.in", "Pass@1234").awaitResult()
      val uid = cred.user!!.uid
      seedUserDocViaEmulatorRest(uid, "CUSTOMER", "cust_only@fix.in")

      val repo = FirestoreAdminRepository(firestore, auth, BackendApiClient(auth, "http://127.0.0.1:$sparkPort"))
      try {
        while (repo.sessionState.value is AdminSessionState.Loading) {
          delay(50)
        }
        assertTrue(
          "Expected Unauthorized for CUSTOMER user, got ${repo.sessionState.value}",
          repo.sessionState.value is AdminSessionState.Unauthorized
        )
      } finally {
        repo.dispose()
      }
    }
  }

  @Test
  fun `admin user approves mechanic imports csv dispatches request and updates config`() = runBlocking(Dispatchers.IO) {
    Assume.assumeTrue("Emulators & Spark backend must run on 8085/9099/5055", areEmulatorsRunning())
    withTimeout(10000L) {
      val cred = auth.createUserWithEmailAndPassword("admin_live@fix.in", "Pass@1234").awaitResult()
      val uid = cred.user!!.uid
      seedUserDocViaEmulatorRest(uid, "ADMIN", "admin_live@fix.in")
      seedPendingMechanicViaEmulatorRest("mech_pending_1", "Pending Bike Pro")

      val repo = FirestoreAdminRepository(firestore, auth, BackendApiClient(auth, "http://127.0.0.1:$sparkPort"))
      try {
        while (repo.sessionState.value !is AdminSessionState.Authenticated) {
          delay(50)
        }
        while (repo.mechanics.value.isEmpty()) {
          delay(50)
        }

        val approveRes = repo.updateMechanicStatus("mech_pending_1", MechanicApprovalStatus.APPROVED, "Verified")
        assertTrue("Approve failed: ${approveRes.exceptionOrNull()?.message}", approveRes.isSuccess)

        val csvRes = repo.commitCsvImport(
          listOf(
            MechanicItem(
              id = "csv_1",
              name = "CSV Live Mech",
              phone = "9877665544",
              email = "csvlive@fix.in",
              approvalStatus = MechanicApprovalStatus.PENDING,
              isOnline = false,
              isBusy = false,
              vehicleTypes = listOf("TWO_WHEELER"),
              serviceCategories = listOf("FLAT_TYRE"),
              address = "Sector 29",
              lat = 28.46,
              lng = 77.03
            )
          )
        )
        assertTrue("CSV import failed: ${csvRes.exceptionOrNull()?.message}", csvRes.isSuccess)
        assertEquals(1, csvRes.getOrNull())

        val cfgRes = repo.updateConfig(8.0, 4, 50)
        assertTrue("Config update failed: ${cfgRes.exceptionOrNull()?.message}", cfgRes.isSuccess)

        val reqRes = repo.simulateRequest("TWO_WHEELER", "FLAT_TYRE", "Sector 29 Market")
        assertTrue("Simulate request failed: ${reqRes.exceptionOrNull()?.message}", reqRes.isSuccess)
        val reqId = reqRes.getOrNull()!!

        val cancelRes = repo.cancelRequest(reqId, "Test complete")
        assertTrue("Cancel failed: ${cancelRes.exceptionOrNull()?.message}", cancelRes.isSuccess)

        delay(200)
        val cancelled = repo.requests.value.firstOrNull { it.id == reqId }
        assertEquals(ServiceRequestStatus.CANCELLED, cancelled?.status)
      } finally {
        repo.dispose()
      }
    }
  }
}
