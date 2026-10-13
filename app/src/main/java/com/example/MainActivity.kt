package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.MechanicApprovalStatus
import com.example.model.ServiceRequestStatus
import com.example.ui.*
import com.example.ui.theme.AmberPrimary
import com.example.ui.theme.FixMechanicAdminTheme
import com.example.viewmodel.AdminViewModel

enum class AdminTab(val title: String, val icon: ImageVector, val tag: String) {
  OVERVIEW("Overview", Icons.Default.Dashboard, "tab_overview"),
  FLEET("Fleet", Icons.Default.Engineering, "tab_fleet"),
  REQUESTS("Requests", Icons.Default.Emergency, "tab_requests"),
  CONFIG("Config", Icons.Default.Tune, "tab_config"),
  AUDIT("Audit", Icons.Default.Security, "tab_audit")
}

class MainActivity : ComponentActivity() {
  private val viewModel: AdminViewModel by viewModels()

  @OptIn(ExperimentalMaterial3Api::class)
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()

    setContent {
      FixMechanicAdminTheme {
        var currentTab by remember { mutableStateOf(AdminTab.OVERVIEW) }
        val snackbarHostState = remember { SnackbarHostState() }
        val statusMsg by viewModel.statusMessage.collectAsState()
        val mechanics by viewModel.mechanics.collectAsState()
        val requests by viewModel.requests.collectAsState()

        val pendingCount = mechanics.count { it.approvalStatus == MechanicApprovalStatus.PENDING }
        val activeCount = requests.count {
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

        LaunchedEffect(statusMsg) {
          statusMsg?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearStatusMessage()
          }
        }

        Scaffold(
          topBar = {
            TopAppBar(
              title = {
                Column {
                  Text(
                    text = "FixMechanic Admin",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp
                  )
                  Text(
                    text = "Gurugram Sector 29 Pilot Zone",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                  )
                }
              },
              actions = {
                Badge(
                  containerColor = AmberPrimary,
                  modifier = Modifier.padding(end = 12.dp)
                ) {
                  Text("OPS ADMIN", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
              },
              colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.surface
              )
            )
          },
          bottomBar = {
            NavigationBar(
              containerColor = MaterialTheme.colorScheme.surface,
              tonalElevation = 6.dp,
              modifier = Modifier.testTag("admin_bottom_nav")
            ) {
              AdminTab.values().forEach { tab ->
                val badgeCount = when (tab) {
                  AdminTab.FLEET -> pendingCount
                  AdminTab.REQUESTS -> activeCount
                  else -> 0
                }

                NavigationBarItem(
                  selected = currentTab == tab,
                  onClick = { currentTab = tab },
                  icon = {
                    BadgedBox(badge = {
                      if (badgeCount > 0) {
                        Badge { Text(badgeCount.toString()) }
                      }
                    }) {
                      Icon(imageVector = tab.icon, contentDescription = tab.title)
                    }
                  },
                  label = { Text(tab.title) },
                  modifier = Modifier.testTag(tab.tag)
                )
              }
            }
          },
          snackbarHost = { SnackbarHost(snackbarHostState) },
          contentWindowInsets = WindowInsets.systemBars
        ) { innerPadding ->
          Box(
            modifier = Modifier
              .fillMaxSize()
              .padding(innerPadding)
          ) {
            when (currentTab) {
              AdminTab.OVERVIEW -> AdminOverviewScreen(
                viewModel = viewModel,
                onNavigateToFleet = { currentTab = AdminTab.FLEET },
                onNavigateToRequests = { currentTab = AdminTab.REQUESTS }
              )
              AdminTab.FLEET -> MechanicFleetScreen(viewModel = viewModel)
              AdminTab.REQUESTS -> EmergencyRequestsScreen(viewModel = viewModel)
              AdminTab.CONFIG -> DispatchConfigScreen(viewModel = viewModel)
              AdminTab.AUDIT -> AuditLogScreen(viewModel = viewModel)
            }
          }
        }
      }
    }
  }
}
