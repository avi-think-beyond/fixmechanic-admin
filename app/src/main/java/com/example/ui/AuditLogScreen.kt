package com.example.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.SlateNavyMedium
import com.example.viewmodel.AdminViewModel
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun AuditLogScreen(
  viewModel: AdminViewModel,
  modifier: Modifier = Modifier
) {
  val auditLogs by viewModel.auditLogs.collectAsState()
  val timeFormatter = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp)
  ) {
    Text(
      text = "Privileged Security & Operations Log",
      style = MaterialTheme.typography.titleLarge,
      fontWeight = FontWeight.Bold
    )

    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .testTag("audit_logs_list"),
      verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      items(auditLogs, key = { it.id }) { log ->
        Card(
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
          shape = RoundedCornerShape(12.dp),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Text(
                text = log.action,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = SlateNavyMedium
              )
              Text(
                text = timeFormatter.format(Date(log.timestamp)),
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
              )
            }

            Text(
              text = "Actor: ${log.admin} • Target: ${log.targetType} (${log.targetId})",
              fontSize = 11.sp,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text(
              text = log.details,
              fontSize = 12.sp
            )
          }
        }
      }
    }
  }
}
