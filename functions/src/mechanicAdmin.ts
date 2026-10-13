/**
 * FixMechanic Admin Operations
 * Privileged mechanic status updates, CSV batch import with row validation,
 * preview mode, duplicate detection, and emergency request interventions.
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  MechanicProfile,
  MechanicApprovalStatus,
  VehicleType,
} from "./types";
import { assertCallerRole, syncUserClaims } from "./auth";
import { dispatchServiceRequest } from "./dispatchEngine";

export interface UpdateMechanicStatusInput {
  mechanicId: string;
  targetStatus: MechanicApprovalStatus;
  reason?: string;
}

export interface CsvMechanicRow {
  name: string;
  phone: string;
  email?: string;
  vehicleTypes: string; // comma-separated e.g. "TWO_WHEELER,FOUR_WHEELER_CAR"
  serviceCategories: string; // comma-separated e.g. "FLAT_TYRE,BATTERY_JUMPSTART"
  locality?: string;
  lat?: number | string;
  lng?: number | string;
}

export interface CsvValidationResult {
  totalRows: number;
  validRows: Array<{
    name: string;
    phone: string;
    email?: string;
    vehicleTypes: VehicleType[];
    serviceCategories: string[];
    lat: number;
    lng: number;
    locality: string;
  }>;
  invalidRows: Array<{
    rowIndex: number;
    data: Record<string, string>;
    errors: string[];
  }>;
  duplicateCount: number;
}

export async function handleUpdateMechanicStatus(
  data: UpdateMechanicStatusInput,
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore
): Promise<{ success: boolean; mechanicId: string; status: MechanicApprovalStatus }> {
  // Only authenticated ADMIN can alter approval status
  const caller = await assertCallerRole(context, db, ["ADMIN"]);
  const adminId = caller.uid;

  if (!data.mechanicId || !data.targetStatus) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Mechanic ID and target status are required."
    );
  }

  const validStatuses: MechanicApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
  if (!validStatuses.includes(data.targetStatus)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Invalid target status: ${data.targetStatus}`
    );
  }

  const mechRef = db.collection("mechanicProfiles").doc(data.mechanicId);
  const mechDoc = await mechRef.get();

  if (!mechDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Mechanic profile not found.");
  }

  const now = Date.now();
  const updatePayload: Partial<MechanicProfile> = {
    approvalStatus: data.targetStatus,
    verifiedAt: now,
    verifiedBy: adminId,
  };

  if (data.targetStatus === "REJECTED" || data.targetStatus === "SUSPENDED") {
    updatePayload.rejectionReason = data.reason || "Action taken by administrator";
    updatePayload.isOnline = false; // Immediately take offline
  }

  await mechRef.update(updatePayload);

  // Sync custom user claims for security rules
  await syncUserClaims(data.mechanicId, "MECHANIC", data.targetStatus);

  // Record audit log
  await db.collection("adminAuditLogs").add({
    id: db.collection("adminAuditLogs").doc().id,
    adminId,
    adminEmail: caller.email,
    action: `MECHANIC_STATUS_${data.targetStatus}`,
    targetType: "MECHANIC",
    targetId: data.mechanicId,
    details: {
      newStatus: data.targetStatus,
      reason: data.reason || null,
      timestamp: now,
    },
    timestamp: now,
  });

  return {
    success: true,
    mechanicId: data.mechanicId,
    status: data.targetStatus,
  };
}

/**
 * Validate and preview or commit CSV import of mechanics
 */
export async function handleProcessMechanicsCsv(
  data: { rows: CsvMechanicRow[]; commit: boolean },
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore
): Promise<{
  success: boolean;
  committed: boolean;
  validation: CsvValidationResult;
  importedCount: number;
}> {
  const caller = await assertCallerRole(context, db, ["ADMIN"]);
  const adminId = caller.uid;

  if (!Array.isArray(data.rows) || data.rows.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "CSV data array is required and must not be empty.");
  }

  // Pre-fetch existing mechanics to detect duplicates by phone
  const existingSnapshot = await db.collection("mechanicProfiles").get();
  const existingPhones = new Set<string>();
  existingSnapshot.forEach((doc) => {
    const p = doc.data().phone;
    if (p) existingPhones.add(cleanPhone(p));
  });

  const validRows: CsvValidationResult["validRows"] = [];
  const invalidRows: CsvValidationResult["invalidRows"] = [];
  const seenInBatchPhones = new Set<string>();
  let duplicateCount = 0;

  data.rows.forEach((row, index) => {
    const rowErrors: string[] = [];
    const name = (row.name || "").trim();
    const rawPhone = (row.phone || "").trim();
    const phone = cleanPhone(rawPhone);

    if (!name || name.length < 2) {
      rowErrors.push("Name is missing or too short.");
    }

    if (!phone || phone.length < 10) {
      rowErrors.push(`Invalid phone number: '${rawPhone}'. Must be 10 digits.`);
    }

    if (existingPhones.has(phone)) {
      rowErrors.push(`Duplicate phone number (already registered in system: ${phone}).`);
      duplicateCount++;
    } else if (seenInBatchPhones.has(phone)) {
      rowErrors.push(`Duplicate phone number within this CSV file: ${phone}.`);
      duplicateCount++;
    } else {
      seenInBatchPhones.add(phone);
    }

    // Vehicle types
    const rawVTypes = (row.vehicleTypes || "TWO_WHEELER,FOUR_WHEELER_CAR")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
    const parsedVTypes: VehicleType[] = [];
    for (const v of rawVTypes) {
      if (["TWO_WHEELER", "FOUR_WHEELER_CAR", "COMMERCIAL_LIGHT", "EV_TWO_WHEELER", "EV_FOUR_WHEELER"].includes(v)) {
        parsedVTypes.push(v as VehicleType);
      }
    }
    if (parsedVTypes.length === 0) {
      rowErrors.push("At least one valid vehicle type is required.");
    }

    // Service categories
    const parsedCategories = (row.serviceCategories || "FLAT_TYRE,BATTERY_JUMPSTART")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    // Coordinates (default to pilot center if empty or invalid)
    let lat = typeof row.lat === "number" ? row.lat : parseFloat(row.lat as string);
    let lng = typeof row.lng === "number" ? row.lng : parseFloat(row.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      lat = 28.4595 + (Math.random() - 0.5) * 0.05; // Sector 29 Gurugram locality
      lng = 77.0266 + (Math.random() - 0.5) * 0.05;
    }

    if (rowErrors.length > 0) {
      invalidRows.push({
        rowIndex: index + 1,
        data: row as unknown as Record<string, string>,
        errors: rowErrors,
      });
    } else {
      validRows.push({
        name,
        phone,
        email: row.email ? row.email.trim() : undefined,
        vehicleTypes: parsedVTypes,
        serviceCategories: parsedCategories,
        lat,
        lng,
        locality: (row.locality || "Sector 29 Gurugram").trim(),
      });
    }
  });

  let importedCount = 0;

  // If commit is true and there are valid rows, save in batches
  if (data.commit && validRows.length > 0) {
    const now = Date.now();
    const batch = db.batch();

    for (const vRow of validRows) {
      const mechanicId = `mech_${vRow.phone.slice(-6)}_${Math.random().toString(36).slice(2, 6)}`;
      const mechRef = db.collection("mechanicProfiles").doc(mechanicId);

      const profile: MechanicProfile = {
        mechanicId,
        name: vRow.name,
        phone: vRow.phone,
        email: vRow.email,
        approvalStatus: "PENDING", // Enforces onboarding rule: Starts in PENDING!
        isOnline: false,
        isBusy: false,
        activeJobId: null,
        vehicleTypes: vRow.vehicleTypes,
        serviceCategories: vRow.serviceCategories,
        currentLocation: {
          lat: vRow.lat,
          lng: vRow.lng,
          address: vRow.locality,
          updatedAt: now,
        },
        serviceAreaId: "pilot_gurugram",
        ratingAverage: 5.0,
        ratingCount: 0,
        createdAt: now,
      };

      batch.set(mechRef, profile);

      // Create matching users record
      const userRef = db.collection("users").doc(mechanicId);
      batch.set(userRef, {
        uid: mechanicId,
        role: "MECHANIC",
        phone: vRow.phone,
        displayName: vRow.name,
        createdAt: now,
      });

      importedCount++;
    }

    await batch.commit();

    // Log admin audit event
    await db.collection("adminAuditLogs").add({
      id: db.collection("adminAuditLogs").doc().id,
      adminId,
      adminEmail: caller.email,
      action: "CSV_MECHANICS_IMPORTED",
      targetType: "MECHANIC",
      targetId: "BATCH_IMPORT",
      details: {
        totalSubmitted: data.rows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        duplicateCount,
        importedCount,
      },
      timestamp: Date.now(),
    });
  }

  return {
    success: true,
    committed: data.commit,
    validation: {
      totalRows: data.rows.length,
      validRows,
      invalidRows,
      duplicateCount,
    },
    importedCount,
  };
}

/**
 * Admin Emergency Cancel or Reassign Operation
 */
export async function handleAdminCancelOrReassign(
  data: { requestId: string; action: "CANCEL" | "REASSIGN"; reason: string },
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore
): Promise<{ success: boolean; message: string }> {
  const caller = await assertCallerRole(context, db, ["ADMIN"]);
  const adminId = caller.uid;

  const reqRef = db.collection("serviceRequests").doc(data.requestId);
  const reqDoc = await reqRef.get();

  if (!reqDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Service request not found.");
  }

  const now = Date.now();
  const request = reqDoc.data();

  if (data.action === "CANCEL") {
    await reqRef.update({
      status: "CANCELLED",
      cancelledAt: now,
      cancelledBy: `ADMIN_${adminId}`,
      cancellationReason: data.reason || "Administrative cancellation",
      updatedAt: now,
    });

    if (request?.assignedMechanicId) {
      await db.collection("mechanicProfiles").doc(request.assignedMechanicId).update({
        isBusy: false,
        activeJobId: null,
      });
    }

    await db.collection("jobChats").doc(data.requestId).update({
      status: "CLOSED",
      closedAt: now,
      closedReason: `Admin cancelled: ${data.reason}`,
    }).catch(() => {});
  } else if (data.action === "REASSIGN") {
    // Release previous mechanic if any
    if (request?.assignedMechanicId) {
      await db.collection("mechanicProfiles").doc(request.assignedMechanicId).update({
        isBusy: false,
        activeJobId: null,
      });
    }

    // Reset status to SEARCHING and trigger dispatch
    await reqRef.update({
      status: "SEARCHING",
      assignedMechanicId: null,
      assignedMechanicName: null,
      dispatchBatch: (request?.dispatchBatch || 1) + 1,
      updatedAt: now,
    });

    dispatchServiceRequest(db, data.requestId, (request?.dispatchBatch || 1) + 1).catch(console.error);
  }

  await db.collection("adminAuditLogs").add({
    id: db.collection("adminAuditLogs").doc().id,
    adminId,
    adminEmail: caller.email,
    action: `ADMIN_REQUEST_${data.action}`,
    targetType: "SERVICE_REQUEST",
    targetId: data.requestId,
    details: { reason: data.reason, previousStatus: request?.status },
    timestamp: now,
  });

  return { success: true, message: `Request successfully ${data.action.toLowerCase()}ed.` };
}

function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
