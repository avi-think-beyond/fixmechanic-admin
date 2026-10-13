package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.model.MechanicApprovalStatus
import com.example.model.ServiceRequestStatus
import com.example.viewmodel.AdminViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("FixMechanic Admin", appName)
  }

  @Test
  fun `admin viewmodel loads initial fleet and requests`() {
    val vm = AdminViewModel()
    assertTrue(vm.mechanics.value.isNotEmpty())
    assertTrue(vm.requests.value.isNotEmpty())
    assertTrue(vm.auditLogs.value.isNotEmpty())
  }

  @Test
  fun `admin viewmodel parses and validates csv with duplicate detection`() {
    val vm = AdminViewModel()
    val testCsv = """
      name,phone,email,vehicleTypes,serviceCategories,locality,lat,lng
      Test Mechanic,9819999991,test@example.com,"TWO_WHEELER","FLAT_TYRE",Sector 29 Gurugram,28.45,77.02
      Duplicate Mechanic,9819999991,dup@example.com,"TWO_WHEELER","FLAT_TYRE",Sector 29 Gurugram,28.45,77.02
      Invalid Phone,123,bad@example.com,"TWO_WHEELER","FLAT_TYRE",Sector 29 Gurugram,28.45,77.02
    """.trimIndent()

    val result = vm.parseAndValidateCsv(testCsv)
    assertEquals(1, result.validRows.size)
    assertEquals(1, result.duplicateCount)
    assertEquals(2, result.invalidRows.size)

    // Check newly parsed mechanic starts strictly in PENDING status
    assertEquals(MechanicApprovalStatus.PENDING, result.validRows[0].approvalStatus)
  }

  @Test
  fun `admin viewmodel updates mechanic approval status and records audit log`() {
    val vm = AdminViewModel()
    val pendingMech = vm.mechanics.value.first { it.approvalStatus == MechanicApprovalStatus.PENDING }

    vm.updateMechanicStatus(pendingMech.id, MechanicApprovalStatus.APPROVED, "Verified by Admin")

    val updated = vm.mechanics.value.first { it.id == pendingMech.id }
    assertEquals(MechanicApprovalStatus.APPROVED, updated.approvalStatus)

    val latestLog = vm.auditLogs.value.first()
    assertEquals("MECHANIC_STATUS_APPROVED", latestLog.action)
    assertEquals(pendingMech.id, latestLog.targetId)
  }

  @Test
  fun `admin viewmodel simulates roadside dispatch and atomic assignment`() {
    val vm = AdminViewModel()
    val prevCount = vm.requests.value.size

    vm.simulateRequest("FOUR_WHEELER_CAR", "BATTERY_JUMPSTART", "Sector 29 Gurugram Hub")

    val newRequests = vm.requests.value
    assertEquals(prevCount + 1, newRequests.size)

    val newest = newRequests.first()
    assertNotNull(newest.id)
    assertTrue(newest.status == ServiceRequestStatus.ASSIGNED || newest.status == ServiceRequestStatus.SEARCHING)
  }
}
