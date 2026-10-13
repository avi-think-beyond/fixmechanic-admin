package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.example.model.CsvParseResult
import com.example.model.MechanicApprovalStatus
import com.example.model.MechanicItem
import com.example.ui.theme.*
import com.example.viewmodel.AdminViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MechanicFleetScreen(
  viewModel: AdminViewModel,
  modifier: Modifier = Modifier
) {
  val mechanics by viewModel.mechanics.collectAsState()
  var searchQuery by remember { mutableStateOf("") }
  var filterStatus by remember { mutableStateOf<MechanicApprovalStatus?>(null) }
  var showCsvDialog by remember { mutableStateOf(false) }

  val filteredMechanics = mechanics.filter { mech ->
    val matchesFilter = filterStatus == null || mech.approvalStatus == filterStatus
    val matchesSearch = if (searchQuery.isBlank()) true else {
      mech.name.contains(searchQuery, ignoreCase = true) ||
      mech.phone.contains(searchQuery) ||
      mech.address.contains(searchQuery, ignoreCase = true)
    }
    matchesFilter && matchesSearch
  }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp)
  ) {
    // Top Bar with Search & Import Button
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      OutlinedTextField(
        value = searchQuery,
        onValueChange = { searchQuery = it },
        placeholder = { Text("Search name, phone, locality...") },
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
          .weight(1f)
          .testTag("mechanic_search_input")
      )

      Button(
        onClick = { showCsvDialog = true },
        colors = ButtonDefaults.buttonColors(containerColor = AmberPrimary),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.testTag("open_csv_import_button")
      ) {
        Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text("CSV Import")
      }
    }

    // Filter Chips
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      FilterChip(
        selected = filterStatus == null,
        onClick = { filterStatus = null },
        label = { Text("All (${mechanics.size})") },
        modifier = Modifier.testTag("filter_all_mechs")
      )
      FilterChip(
        selected = filterStatus == MechanicApprovalStatus.PENDING,
        onClick = { filterStatus = MechanicApprovalStatus.PENDING },
        label = { Text("Pending (${mechanics.count { it.approvalStatus == MechanicApprovalStatus.PENDING }})") },
        modifier = Modifier.testTag("filter_pending_mechs")
      )
      FilterChip(
        selected = filterStatus == MechanicApprovalStatus.APPROVED,
        onClick = { filterStatus = MechanicApprovalStatus.APPROVED },
        label = { Text("Approved (${mechanics.count { it.approvalStatus == MechanicApprovalStatus.APPROVED }})") },
        modifier = Modifier.testTag("filter_approved_mechs")
      )
      FilterChip(
        selected = filterStatus == MechanicApprovalStatus.SUSPENDED,
        onClick = { filterStatus = MechanicApprovalStatus.SUSPENDED },
        label = { Text("Suspended") }
      )
    }

    // Fleet List
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .testTag("mechanics_list"),
      verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      items(filteredMechanics, key = { it.id }) { mechanic ->
        MechanicCard(
          mechanic = mechanic,
          onApprove = { viewModel.updateMechanicStatus(mechanic.id, MechanicApprovalStatus.APPROVED) },
          onReject = { viewModel.updateMechanicStatus(mechanic.id, MechanicApprovalStatus.REJECTED) },
          onSuspend = { viewModel.updateMechanicStatus(mechanic.id, MechanicApprovalStatus.SUSPENDED) }
        )
      }
    }
  }

  // CSV Import Dialog
  if (showCsvDialog) {
    CsvImportDialog(
      onDismiss = { showCsvDialog = false },
      onValidate = { viewModel.parseAndValidateCsv(it) },
      onCommit = {
        viewModel.commitCsvImport(it)
        showCsvDialog = false
      }
    )
  }
}

@Composable
fun MechanicCard(
  mechanic: MechanicItem,
  onApprove: () -> Unit,
  onReject: () -> Unit,
  onSuspend: () -> Unit
) {
  Card(
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    shape = RoundedCornerShape(14.dp),
    modifier = Modifier
      .fillMaxWidth()
      .testTag("mechanic_card_${mechanic.id}")
  ) {
    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Column {
          Text(text = mechanic.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
          Text(text = mechanic.phone, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        }

        // Status Badge
        val (statusText, bgCol, textCol) = when (mechanic.approvalStatus) {
          MechanicApprovalStatus.APPROVED -> Triple("APPROVED", StatusGreenBg, StatusGreen)
          MechanicApprovalStatus.PENDING -> Triple("PENDING", StatusAmberBg, StatusAmber)
          MechanicApprovalStatus.SUSPENDED -> Triple("SUSPENDED", StatusRedBg, StatusRed)
          MechanicApprovalStatus.REJECTED -> Triple("REJECTED", Color(0xFFE2E8F0), Color(0xFF475569))
        }

        Box(
          modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bgCol)
            .padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
          Text(text = statusText, color = textCol, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
      }

      // Online & Location Info
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Box(
            modifier = Modifier
              .size(8.dp)
              .clip(RoundedCornerShape(4.dp))
              .background(if (mechanic.isOnline) StatusGreen else Color.Gray)
          )
          Spacer(modifier = Modifier.width(6.dp))
          Text(
            text = if (mechanic.isOnline) (if (mechanic.isBusy) "Busy (In Job)" else "Online & Ready") else "Offline",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
          )
        }

        Text(
          text = "⭐ ${mechanic.rating} (${mechanic.ratingCount})",
          fontSize = 12.sp,
          fontWeight = FontWeight.Medium
        )
      }

      Text(
        text = "📍 ${mechanic.address}",
        fontSize = 12.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant
      )

      Text(
        text = "Vehicles: ${mechanic.vehicleTypes.joinToString(", ")}",
        fontSize = 11.sp,
        color = SlateNavyLight
      )

      // Action Buttons
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically
      ) {
        when (mechanic.approvalStatus) {
          MechanicApprovalStatus.PENDING -> {
            OutlinedButton(
              onClick = onReject,
              shape = RoundedCornerShape(8.dp),
              modifier = Modifier.testTag("reject_${mechanic.id}")
            ) {
              Text("Reject", color = StatusRed)
            }
            Spacer(modifier = Modifier.width(8.dp))
            Button(
              onClick = onApprove,
              colors = ButtonDefaults.buttonColors(containerColor = AmberPrimary),
              shape = RoundedCornerShape(8.dp),
              modifier = Modifier.testTag("approve_${mechanic.id}")
            ) {
              Text("Approve")
            }
          }
          MechanicApprovalStatus.APPROVED -> {
            OutlinedButton(
              onClick = onSuspend,
              shape = RoundedCornerShape(8.dp),
              modifier = Modifier.testTag("suspend_${mechanic.id}")
            ) {
              Text("Suspend", color = StatusRed)
            }
          }
          MechanicApprovalStatus.SUSPENDED -> {
            Button(
              onClick = onApprove,
              shape = RoundedCornerShape(8.dp),
              modifier = Modifier.testTag("reactivate_${mechanic.id}")
            ) {
              Text("Re-activate")
            }
          }
          MechanicApprovalStatus.REJECTED -> {
            OutlinedButton(onClick = onApprove, shape = RoundedCornerShape(8.dp)) {
              Text("Re-evaluate")
            }
          }
        }
      }
    }
  }
}

@Composable
fun CsvImportDialog(
  onDismiss: () -> Unit,
  onValidate: (String) -> CsvParseResult,
  onCommit: (List<MechanicItem>) -> Unit
) {
  var csvContent by remember {
    mutableStateOf(
      """name,phone,email,vehicleTypes,serviceCategories,locality,lat,lng
Rajesh Sharma,9810123401,rajesh@example.com,"TWO_WHEELER,FOUR_WHEELER_CAR","FLAT_TYRE,BATTERY_JUMPSTART",Sector 29 Gurugram,28.4682,77.0617
Amit Kumar,9810123402,amit@example.com,"TWO_WHEELER,FOUR_WHEELER_CAR","FLAT_TYRE,LOCKOUT",DLF Phase 4 Gurugram,28.4725,77.0850
Vikas Yadav,9810123403,vikas@example.com,"FOUR_WHEELER_CAR,COMMERCIAL_LIGHT","TOWING",Sohna Road Gurugram,28.4231,77.0428
Sunil Verma,9810123404,sunil@example.com,"TWO_WHEELER","FLAT_TYRE,FUEL_DELIVERY",Sector 14 Gurugram,28.4750,77.0392
Duplicate Rajesh,9810123401,dup@example.com,"TWO_WHEELER","FLAT_TYRE",Sector 29 Gurugram,28.4682,77.0617
Bad Record,,bad@example.com,"FOUR_WHEELER_CAR","BATTERY_JUMPSTART",Sector 14 Gurugram,28.4750,77.0392"""
    )
  }

  var parseResult by remember { mutableStateOf<CsvParseResult?>(null) }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("Import ~300 Mechanics from CSV", fontWeight = FontWeight.Bold) },
    text = {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .heightIn(max = 420.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        Text(
          text = "Validates name, phone, duplicates, and supported vehicle categories. Begins in PENDING status.",
          fontSize = 12.sp,
          color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        OutlinedTextField(
          value = csvContent,
          onValueChange = {
            csvContent = it
            parseResult = null
          },
          label = { Text("CSV Text Data") },
          modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .testTag("csv_input_field")
        )

        Button(
          onClick = { parseResult = onValidate(csvContent) },
          colors = ButtonDefaults.buttonColors(containerColor = SlateNavyMedium),
          modifier = Modifier
            .fillMaxWidth()
            .testTag("validate_csv_button")
        ) {
          Text("Validate & Preview")
        }

        parseResult?.let { result ->
          Card(
            colors = CardDefaults.cardColors(containerColor = NeutralLightBg),
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
              Text("Total rows in CSV: ${result.totalRows}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
              Text("✅ Valid rows: ${result.validRows.size}", fontSize = 12.sp, color = StatusGreen)
              Text("❌ Invalid rows: ${result.invalidRows.size}", fontSize = 12.sp, color = StatusRed)
              Text("⚠️ Duplicates found: ${result.duplicateCount}", fontSize = 12.sp, color = StatusAmber)

              if (result.invalidRows.isNotEmpty()) {
                Text(
                  text = "Errors: " + result.invalidRows.joinToString("; ") { it.second },
                  fontSize = 11.sp,
                  color = StatusRed
                )
              }
            }
          }
        }
      }
    },
    confirmButton = {
      Button(
        onClick = {
          parseResult?.validRows?.let { onCommit(it) }
        },
        enabled = parseResult != null && (parseResult?.validRows?.isNotEmpty() == true),
        colors = ButtonDefaults.buttonColors(containerColor = AmberPrimary),
        modifier = Modifier.testTag("commit_csv_button")
      ) {
        Text("Commit Import")
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) {
        Text("Cancel")
      }
    }
  )
}
