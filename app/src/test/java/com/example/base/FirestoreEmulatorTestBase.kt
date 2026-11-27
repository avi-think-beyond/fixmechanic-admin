package com.example.base

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.data.FirestoreProvider
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import org.junit.After
import org.junit.Before
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import java.net.HttpURLConnection
import java.net.Socket
import java.net.URL

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@LooperMode(LooperMode.Mode.INSTRUMENTATION_TEST)
abstract class FirestoreEmulatorTestBase {

  protected lateinit var firestore: FirebaseFirestore
  protected lateinit var auth: FirebaseAuth
  protected lateinit var context: Context

  protected val projectId = "fixmechanic-firebase"
  protected val firestorePort = 8085
  protected val authPort = 9099
  protected val sparkPort = 5055

  protected fun isPortOpen(port: Int): Boolean {
    return try {
      Socket("127.0.0.1", port).use { true }
    } catch (_: Exception) {
      false
    }
  }

  protected fun areEmulatorsRunning(): Boolean {
    return isPortOpen(firestorePort) && isPortOpen(authPort) && isPortOpen(sparkPort)
  }

  @Before
  open fun setUpFirebaseEmulators() {
    context = ApplicationProvider.getApplicationContext()
    if (!areEmulatorsRunning()) return

    if (FirebaseApp.getApps(context).isEmpty()) {
      FirebaseApp.initializeApp(
        context,
        FirebaseOptions.Builder()
          .setProjectId(projectId)
          .setApplicationId("1:111465055412:android:fixmechanicadmin")
          .setApiKey("fake-api-key-for-emulator")
          .build()
      )
    }

    auth = FirebaseAuth.getInstance()
    runCatching { auth.useEmulator("127.0.0.1", authPort) }

    firestore = FirestoreProvider.createFirestore(context, isTestOrEmulator = true)
    runCatching { firestore.useEmulator("127.0.0.1", firestorePort) }

    clearEmulators()
  }

  @After
  open fun tearDownFirebaseEmulators() {
    if (!areEmulatorsRunning()) return
    runCatching { auth.signOut() }
    clearEmulators()
  }

  protected fun clearEmulators() {
    try {
      val fsUrl = URL("http://127.0.0.1:$firestorePort/emulator/v1/projects/$projectId/databases/(default)/documents")
      (fsUrl.openConnection() as HttpURLConnection).run {
        requestMethod = "DELETE"
        responseCode
        disconnect()
      }
      val authUrl = URL("http://127.0.0.1:$authPort/emulator/v1/projects/$projectId/accounts")
      (authUrl.openConnection() as HttpURLConnection).run {
        requestMethod = "DELETE"
        responseCode
        disconnect()
      }
    } catch (_: Exception) {}
  }
}
