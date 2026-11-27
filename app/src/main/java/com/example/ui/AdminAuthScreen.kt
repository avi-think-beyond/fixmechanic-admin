package com.example.ui

import android.content.Context
import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.example.model.AdminSessionState
import com.example.ui.theme.AmberPrimary
import com.example.ui.theme.StatusRed
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

@Composable
fun AdminAuthScreen(
  sessionState: AdminSessionState,
  onEmailSignIn: (String, String) -> Unit,
  onGoogleTokenReceived: (String) -> Unit,
  onSignOut: () -> Unit,
  modifier: Modifier = Modifier
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var localError by remember { mutableStateOf<String?>(null) }

  Surface(
    modifier = modifier.fillMaxSize(),
    color = MaterialTheme.colorScheme.background
  ) {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(24.dp),
      contentAlignment = Alignment.Center
    ) {
      Card(
        modifier = Modifier
          .fillMaxWidth()
          .widthIn(max = 460.dp),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
      ) {
        Column(
          modifier = Modifier.padding(24.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp),
          horizontalAlignment = Alignment.CenterHorizontally
        ) {
          Icon(
            imageVector = Icons.Default.AdminPanelSettings,
            contentDescription = "FixMechanic Admin",
            tint = AmberPrimary,
            modifier = Modifier.size(48.dp)
          )
          Text(
            text = "FixMechanic Admin Console",
            fontWeight = FontWeight.ExtraBold,
            fontSize = 20.sp
          )
          Text(
            text = "Sign in with an authorized ADMIN account to manage fleet approvals, dispatch config, and live incidents.",
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )

          if (sessionState is AdminSessionState.Loading) {
            CircularProgressIndicator(modifier = Modifier.padding(vertical = 12.dp))
          } else {
            if (sessionState is AdminSessionState.Unauthorized) {
              Card(
                colors = CardDefaults.cardColors(containerColor = StatusRed.copy(alpha = 0.1f)),
                modifier = Modifier.fillMaxWidth()
              ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                  Text(
                    text = sessionState.reason,
                    color = StatusRed,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                  )
                  TextButton(onClick = onSignOut) {
                    Text("Switch Account")
                  }
                }
              }
            }

            localError?.let { err ->
              Text(text = err, color = StatusRed, fontSize = 12.sp)
            }

            OutlinedTextField(
              value = email,
              onValueChange = { email = it },
              label = { Text("Admin Email") },
              leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
              singleLine = true,
              modifier = Modifier
                .fillMaxWidth()
                .testTag("admin_email_input")
            )

            OutlinedTextField(
              value = password,
              onValueChange = { password = it },
              label = { Text("Password") },
              leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
              visualTransformation = PasswordVisualTransformation(),
              singleLine = true,
              modifier = Modifier
                .fillMaxWidth()
                .testTag("admin_password_input")
            )

            Button(
              onClick = {
                localError = null
                if (email.isBlank() || password.isBlank()) {
                  localError = "Enter both email and password."
                } else {
                  onEmailSignIn(email, password)
                }
              },
              colors = ButtonDefaults.buttonColors(containerColor = AmberPrimary),
              shape = RoundedCornerShape(10.dp),
              modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .testTag("admin_email_signin_button")
            ) {
              Text("Sign In with Email", fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
              onClick = {
                localError = null
                scope.launch {
                  launchGoogleSignIn(
                    context = context,
                    onToken = onGoogleTokenReceived,
                    onError = { localError = it }
                  )
                }
              },
              shape = RoundedCornerShape(10.dp),
              modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .testTag("admin_google_signin_button")
            ) {
              Text("Sign In with Google")
            }
          }
        }
      }
    }
  }
}

private suspend fun launchGoogleSignIn(
  context: Context,
  onToken: (String) -> Unit,
  onError: (String) -> Unit
) {
  try {
    val resId = context.resources.getIdentifier("default_web_client_id", "string", context.packageName)
    val webClientId = if (resId != 0) context.getString(resId) else ""
    if (webClientId.isBlank()) {
      onError("Google Sign-In unavailable (missing default_web_client_id). Use Email/Password login.")
      return
    }
    val googleIdOption = GetGoogleIdOption.Builder()
      .setFilterByAuthorizedAccounts(false)
      .setServerClientId(webClientId)
      .setAutoSelectEnabled(false)
      .build()
    val request = GetCredentialRequest.Builder()
      .addCredentialOption(googleIdOption)
      .build()
    val credentialManager = CredentialManager.create(context)
    val result = credentialManager.getCredential(context, request)
    val cred = result.credential
    if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
      val googleCred = GoogleIdTokenCredential.createFrom(cred.data)
      onToken(googleCred.idToken)
    } else {
      onError("Unsupported Google credential returned.")
    }
  } catch (e: Exception) {
    Log.w("AdminAuthScreen", "Google Sign-In failed", e)
    onError(e.message ?: "Google Sign-In cancelled or failed.")
  }
}
