package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.ServiceRequestItem
import com.example.model.ServiceRequestStatus
import com.example.ui.theme.*
import com.example.viewmodel.AdminViewModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmergencyRequestsScreen(
  viewModel: AdminViewModel,
  modifier: Modifier = Modifier
) {
  val requests by viewModel.requests.collectAsState()
  var searchQuery by remember { mutableStateOf("") }
  var filterActiveOnly by remember { mutableStateOf(false) }
  var selectedRequestForDetail by remember { mutableStateOf<ServiceRequestItem?>(null) }

  val filteredRequests = requests.filter { req ->
    val matchesStatus = if (!filterActiveOnly) true else {
      req.status in listOf(
        ServiceRequestStatus.REQUESTED,
        ServiceRequestStatus.SEARCHING,
        ServiceRequestStatus.ASSIGNED,
        ServiceRequestStatus.ACCEPTED,
        ServiceRequestStatus.EN_ROUTE,
        ServiceRequestStatus.ARRIVED,
        ServiceRequestStatus.IN_PROGRESS
      )
    }

    val matchesSearch = if (searchQuery.isBlank()) true else {
      req.id.contains(searchQuery, ignoreCase = true) ||
      req.customerPhone.contains(searchQuery) ||
      req.vehicleRegNumber.contains(searchQuery, ignoreCase = true) ||
      req.customerName.contains(searchQuery, ignoreCase = true)
    }

    matchesStatus && matchesSearch
  }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp)
  ) {
    // Search Box
    OutlinedTextField(
      value = searchQuery,
      onValueChange = { searchQuery = it },
      placeholder = { Text("Search by Incident ID, Phone, Vehicle Reg...") },
      leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
      shape = RoundedCornerShape(12.dp),
      modifier = Modifier
        .fillMaxWidth()
        .testTag("request_search_input")
    )

    // Filter Chips
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      FilterChip(
        selected = !filterActiveOnly,
        onClick = { filterActiveOnly = false },
        label = { Text("All Incidents (${requests.size})") },
        modifier = Modifier.testTag("filter_all_requests")
      )
      FilterChip(
        selected = filterActiveOnly,
        onClick = { filterActiveOnly = true },
        label = { Text("Active Roadside") },
        modifier = Modifier.testTag("filter_active_requests")
      )
    }

    // Incidents List
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .testTag("requests_list"),
      verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      items(filteredRequests, key = { it.id }) { request ->
        RequestCard(
          request = request,
          onInspect = { selectedRequestForDetail = request }
        )
      }
    }
  }

  // Request Timeline & Details Dialog
  selectedRequestForDetail?.let { req ->
    RequestDetailDialog(
      request = req,
      onDismiss = { selectedRequestForDetail = null },
      onCancel = {
        viewModel.cancelRequest(req.id)
        selectedRequestForDetail = null
      },
      onReassign = {
        viewModel.reassignRequest(req.id)
        selectedRequestForDetail = null
      }
    )
  }
}

@Composable
fun RequestCard(
  request: ServiceRequestItem,
  onInspect: () -> Unit
) {
  val (statusBg, statusFg) = when (request.status) {
    ServiceRequestStatus.COMPLETED -> StatusGreenBg to StatusGreen
    ServiceRequestStatus.CANCELLED -> StatusRedBg to StatusRed
    ServiceRequestStatus.SEARCHING, ServiceRequestStatus.REQUESTED -> StatusAmberBg to StatusAmber
    else -> StatusBlueBg to StatusBlue
  }

  Card(
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    shape = RoundedCornerShape(14.dp),
    modifier = Modifier
      .fillMaxWidth()
      .testTag("request_card_${request.id}")
  ) {
    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Column {
          Text(text = "Incident #${request.id}", fontWeight = FontWeight.Bold, fontSize = 16.sp)
          Text(text = "${request.vehicleType} • ${request.vehicleRegNumber}", color = SlateNavyLight, fontSize = 12.sp)
        }

        Box(
          modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(statusBg)
            .padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
          Text(text = request.status.name, color = statusFg, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
      }

      Text(
        text = "Customer: ${request.customerName} (${request.customerPhone})",
        fontSize = 13.sp,
        fontWeight = FontWeight.Medium
      )

      Text(
        text = "📍 ${request.address}",
        fontSize = 12.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant
      )

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = if (request.assignedMechanicName != null) "Mechanic: ${request.assignedMechanicName}" else "Batch #${request.dispatchBatch} (Searching...)",
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          color = if (request.assignedMechanicName != null) AmberPrimary else StatusAmber
        )

        Button(
          onClick = onInspect,
          shape = RoundedCornerShape(8.dp),
          colors = ButtonDefaults.buttonColors(containerColor = SlateNavyMedium),
          modifier = Modifier.testTag("inspect_${request.id}")
        ) {
          Text("Inspect Timeline", fontSize = 12.sp)
        }
      }
    }
  }
}

@Composable
fun RequestDetailDialog(
  request: ServiceRequestItem,
  onDismiss: () -> Unit,
  onCancel: () -> Unit,
  onReassign: () -> Unit
) {
  val timeFormatter = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Column {
        Text("Incident #${request.id}", fontWeight = FontWeight.Bold)
        Text("${request.serviceCategory} • ${request.vehicleRegNumber}", fontSize = 12.sp, color = Color.Gray)
      }
    },
    text = {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .heightIn(max = 420.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
      ) {
        Card(
          colors = CardDefaults.cardColors(containerColor = NeutralLightBg),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Customer: ${request.customerName} (${request.customerPhone})", fontSize = 12.sp)
            Text("Location: ${request.address}", fontSize = 12.sp)
            Text("Assigned: ${request.assignedMechanicName ?: "Unassigned"}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("Authoritative Status: ${request.status.name}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = AmberPrimary)
          }
        }

        Text("State Machine Transition History:", fontWeight = FontWeight.Bold, fontSize = 13.sp)

        LazyColumn(
          modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 160.dp),
          verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          items(request.timeline) { event ->
            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
              Box(
                modifier = Modifier
                  .size(8.dp)
                  .clip(CircleShape)
                  .background(AmberPrimary)
              )
              Column {
                Text(
                  text = "${event.fromStatus} ➔ ${event.toStatus}",
                  fontSize = 12.sp,
                  fontWeight = FontWeight.Bold
                )
                Text(
                  text = "${timeFormatter.format(Date(event.timestamp))} • By ${event.actor}",
                  fontSize = 10.sp,
                  color = Color.Gray
                )
              }
            }
          }
        }

        // Admin Emergency Actions
        Divider()
        Text("Admin Emergency Interventions:", fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedButton(
            onClick = onCancel,
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.weight(1f)
          ) {
            Text("Cancel Request", color = StatusRed, fontSize = 11.sp)
          }
          Button(
            onClick = onReassign,
            colors = ButtonDefaults.buttonColors(containerColor = AmberPrimary),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.weight(1f)
          ) {
            Text("Reopen / Reassign", fontSize = 11.sp)
          }
        }
      }
    },
    confirmButton = {
      TextButton(onClick = onDismiss) {
        Text("Close")
      }
    }
  )
}
