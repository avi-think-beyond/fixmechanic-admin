package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.MechanicApprovalStatus
import com.example.model.ServiceRequestStatus
import com.example.ui.theme.*
import com.example.viewmodel.AdminViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminOverviewScreen(
  viewModel: AdminViewModel,
  onNavigateToFleet: () -> Unit,
  onNavigateToRequests: () -> Unit,
  modifier: Modifier = Modifier
) {
  val mechanics by viewModel.mechanics.collectAsState()
  val requests by viewModel.requests.collectAsState()
  val auditLogs by viewModel.auditLogs.collectAsState()
  val config by viewModel.config.collectAsState()

  var selectedVehicleType by remember { mutableStateOf("FOUR_WHEELER_CAR") }
  var selectedCategory by remember { mutableStateOf("BATTERY_JUMPSTART") }
  var addressInput by remember { mutableStateOf("Near Leisure Valley Park, Sector 29") }

  val totalMechs = mechanics.size
  val onlineApprovedMechs = mechanics.count { it.isOnline && it.approvalStatus == MechanicApprovalStatus.APPROVED }
  val pendingMechs = mechanics.count { it.approvalStatus == MechanicApprovalStatus.PENDING }
  val activeReqs = requests.count {
    it.status in listOf(
      ServiceRequestStatus.REQUESTED,
      ServiceRequestStatus.SEARCHING,
      ServiceRequestStatus.ASSIGNED,
      ServiceRequestStatus.ACCEPTED,
      ServiceRequestStatus.EN_ROUTE,
      ServiceRequestStatus.ARRIVED,
      ServiceRequestStatus.IN_PROGRESS
    )
  }
  val completedReqs = requests.count { it.status == ServiceRequestStatus.COMPLETED }
  val failedDispatches = auditLogs.count { it.action.contains("EXHAUSTED") }

  Column(
    modifier = modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp)
  ) {
    // Locality Status Header Card
    Card(
      colors = CardDefaults.cardColors(containerColor = SlateNavyDark),
      shape = RoundedCornerShape(16.dp),
      modifier = Modifier
        .fillMaxWidth()
        .testTag("locality_header_card")
    ) {
      Row(
        modifier = Modifier.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
      ) {
        Box(
          modifier = Modifier
            .size(12.dp)
            .clip(CircleShape)
            .background(Color(0xFF22C55E))
        )
        Column(modifier = Modifier.weight(1f)) {
          Text(
            text = "ACTIVE PILOT ZONE",
            color = Color(0xFF94A3B8),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp
          )
          Text(
            text = config.localityName,
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold
          )
          Text(
            text = "Coverage Radius: ${config.defaultSearchRadiusKm} km • Batch Size: ${config.initialOfferBatchSize}",
            color = Color(0xFFCBD5E1),
            fontSize = 12.sp
          )
        }
      }
    }

    // KPI Metrics Section
    Text(
      text = "Operational Metrics",
      style = MaterialTheme.typography.titleMedium,
      fontWeight = FontWeight.Bold
    )

    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      MetricCard(
        title = "Mechanic Fleet",
        value = totalMechs.toString(),
        subtitle = "$onlineApprovedMechs Online",
        icon = Icons.Default.Build,
        iconTint = Color(0xFF4F46E5),
        iconBg = Color(0xFFEEF2FF),
        modifier = Modifier.weight(1f),
        onClick = onNavigateToFleet,
        testTag = "kpi_fleet"
      )

      MetricCard(
        title = "Pending Approvals",
        value = pendingMechs.toString(),
        subtitle = "Needs Review",
        icon = Icons.Default.Warning,
        iconTint = StatusAmber,
        iconBg = StatusAmberBg,
        modifier = Modifier.weight(1f),
        onClick = onNavigateToFleet,
        testTag = "kpi_pending"
      )
    }

    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      MetricCard(
        title = "Active Incidents",
        value = activeReqs.toString(),
        subtitle = "In Dispatch / On Road",
        icon = Icons.Default.Bolt,
        iconTint = StatusRed,
        iconBg = StatusRedBg,
        modifier = Modifier.weight(1f),
        onClick = onNavigateToRequests,
        testTag = "kpi_active"
      )

      MetricCard(
        title = "Resolved Roadside",
        value = completedReqs.toString(),
        subtitle = "Completed",
        icon = Icons.Default.CheckCircle,
        iconTint = StatusGreen,
        iconBg = StatusGreenBg,
        modifier = Modifier.weight(1f),
        onClick = onNavigateToRequests,
        testTag = "kpi_completed"
      )
    }

    // Roadside Incident Simulation Card
    Card(
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
      elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
      shape = RoundedCornerShape(16.dp),
      modifier = Modifier
        .fillMaxWidth()
        .testTag("simulation_card")
    ) {
      Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Icon(
            imageVector = Icons.Default.PlayCircle,
            contentDescription = null,
            tint = AmberPrimary,
            modifier = Modifier.size(24.dp)
          )
          Spacer(modifier = Modifier.width(8.dp))
          Text(
            text = "Roadside Dispatch Sandbox",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
          )
        }

        Text(
          text = "Test matching engine, geospatial radius filtering, and atomic offer acceptance in real-time.",
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        // Vehicle Selector
        Text(text = "Vehicle Type:", style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          listOf("FOUR_WHEELER_CAR" to "Car", "TWO_WHEELER" to "Bike", "COMMERCIAL_LIGHT" to "Commercial").forEach { (type, label) ->
            FilterChip(
              selected = selectedVehicleType == type,
              onClick = { selectedVehicleType = type },
              label = { Text(label, fontSize = 12.sp) }
            )
          }
        }

        // Service Category
        Text(text = "Service Required:", style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          listOf("BATTERY_JUMPSTART" to "Jumpstart", "FLAT_TYRE" to "Puncture", "TOWING" to "Towing").forEach { (cat, label) ->
            FilterChip(
              selected = selectedCategory == cat,
              onClick = { selectedCategory = cat },
              label = { Text(label, fontSize = 12.sp) }
            )
          }
        }

        OutlinedTextField(
          value = addressInput,
          onValueChange = { addressInput = it },
          label = { Text("Breakdown Location Landmark") },
          modifier = Modifier
            .fillMaxWidth()
            .testTag("sim_address_input")
        )

        Button(
          onClick = {
            viewModel.simulateRequest(selectedVehicleType, selectedCategory, addressInput)
          },
          colors = ButtonDefaults.buttonColors(containerColor = AmberPrimary),
          shape = RoundedCornerShape(10.dp),
          modifier = Modifier
            .fillMaxWidth()
            .testTag("dispatch_test_button")
        ) {
          Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
          Spacer(modifier = Modifier.width(8.dp))
          Text("Dispatch Breakdown Request")
        }
      }
    }
  }
}

@Composable
fun MetricCard(
  title: String,
  value: String,
  subtitle: String,
  icon: ImageVector,
  iconTint: Color,
  iconBg: Color,
  modifier: Modifier = Modifier,
  onClick: () -> Unit = {},
  testTag: String = ""
) {
  Card(
    onClick = onClick,
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    shape = RoundedCornerShape(16.dp),
    modifier = modifier.testTag(testTag)
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(14.dp),
      verticalArrangement = Arrangement.SpaceBetween
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = title,
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Box(
          modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(iconBg),
          contentAlignment = Alignment.Center
        ) {
          Icon(
            imageVector = icon,
            contentDescription = null,
            tint = iconTint,
            modifier = Modifier.size(18.dp)
          )
        }
      }

      Spacer(modifier = Modifier.height(10.dp))

      Text(
        text = value,
        fontSize = 26.sp,
        fontWeight = FontWeight.ExtraBold,
        color = MaterialTheme.colorScheme.onSurface
      )

      Text(
        text = subtitle,
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
      )
    }
  }
}
