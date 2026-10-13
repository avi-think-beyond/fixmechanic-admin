package com.example.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.AmberPrimary
import com.example.viewmodel.AdminViewModel

@Composable
fun DispatchConfigScreen(
  viewModel: AdminViewModel,
  modifier: Modifier = Modifier
) {
  val config by viewModel.config.collectAsState()

  var radiusInput by remember(config) { mutableStateOf(config.defaultSearchRadiusKm.toString()) }
  var batchSizeInput by remember(config) { mutableStateOf(config.initialOfferBatchSize.toString()) }
  var timeoutInput by remember(config) { mutableStateOf(config.offerTimeoutSeconds.toString()) }

  Column(
    modifier = modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp)
  ) {
    Text(
      text = "Locality Dispatch Rules",
      style = MaterialTheme.typography.titleLarge,
      fontWeight = FontWeight.Bold
    )

    Card(
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
      elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
      shape = RoundedCornerShape(16.dp),
      modifier = Modifier.fillMaxWidth()
    ) {
      Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
          value = radiusInput,
          onValueChange = { radiusInput = it },
          label = { Text("Initial Search Radius (km)") },
          modifier = Modifier
            .fillMaxWidth()
            .testTag("cfg_radius_input")
        )

        OutlinedTextField(
          value = batchSizeInput,
          onValueChange = { batchSizeInput = it },
          label = { Text("Initial Offer Batch Size (Mechanics)") },
          modifier = Modifier
            .fillMaxWidth()
            .testTag("cfg_batch_input")
        )

        OutlinedTextField(
          value = timeoutInput,
          onValueChange = { timeoutInput = it },
          label = { Text("Offer Timeout Horizon (Seconds)") },
          modifier = Modifier
            .fillMaxWidth()
            .testTag("cfg_timeout_input")
        )

        OutlinedTextField(
          value = config.localityName,
          onValueChange = {},
          readOnly = true,
          label = { Text("Active Coverage Pilot Zone") },
          modifier = Modifier.fillMaxWidth()
        )

        Button(
          onClick = {
            val r = radiusInput.toDoubleOrNull() ?: 5.0
            val b = batchSizeInput.toIntOrNull() ?: 3
            val t = timeoutInput.toIntOrNull() ?: 45
            viewModel.updateConfig(r, b, t)
          },
          colors = ButtonDefaults.buttonColors(containerColor = AmberPrimary),
          shape = RoundedCornerShape(10.dp),
          modifier = Modifier
            .fillMaxWidth()
            .testTag("save_config_button")
        ) {
          Icon(Icons.Default.Save, contentDescription = null)
          Spacer(modifier = Modifier.width(8.dp))
          Text("Save Operational Parameters")
        }
      }
    }
  }
}
