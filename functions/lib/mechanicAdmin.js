"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUpdateMechanicStatus = handleUpdateMechanicStatus;
exports.handleProcessMechanicsCsv = handleProcessMechanicsCsv;
exports.handleAdminCancelOrReassign = handleAdminCancelOrReassign;
/**
 * FixMechanic Admin Operations
 * Privileged mechanic status updates, CSV batch import with row validation,
 * preview mode, duplicate detection, and emergency request interventions.
 */
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
const dispatchEngine_1 = require("./dispatchEngine");
async function handleUpdateMechanicStatus(data, context, db) {
    // Only authenticated ADMIN can alter approval status
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["ADMIN"]);
    const adminId = caller.uid;
    if (!data.mechanicId || !data.targetStatus) {
        throw new functions.https.HttpsError("invalid-argument", "Mechanic ID and target status are required.");
    }
    const validStatuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
    if (!validStatuses.includes(data.targetStatus)) {
        throw new functions.https.HttpsError("invalid-argument", `Invalid target status: ${data.targetStatus}`);
    }
    const mechRef = db.collection("mechanicProfiles").doc(data.mechanicId);
    const mechDoc = await mechRef.get();
    if (!mechDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Mechanic profile not found.");
    }
    const now = Date.now();
    const updatePayload = {
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
    await (0, auth_1.syncUserClaims)(data.mechanicId, "MECHANIC", data.targetStatus);
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
async function handleProcessMechanicsCsv(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["ADMIN"]);
    const adminId = caller.uid;
    if (!Array.isArray(data.rows) || data.rows.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "CSV data array is required and must not be empty.");
    }
    // Pre-fetch existing mechanics to detect duplicates by phone
    const existingSnapshot = await db.collection("mechanicProfiles").get();
    const existingPhones = new Set();
    existingSnapshot.forEach((doc) => {
        const p = doc.data().phone;
        if (p)
            existingPhones.add(cleanPhone(p));
    });
    const validRows = [];
    const invalidRows = [];
    const seenInBatchPhones = new Set();
    let duplicateCount = 0;
    data.rows.forEach((row, index) => {
        const rowErrors = [];
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
        }
        else if (seenInBatchPhones.has(phone)) {
            rowErrors.push(`Duplicate phone number within this CSV file: ${phone}.`);
            duplicateCount++;
        }
        else {
            seenInBatchPhones.add(phone);
        }
        // Vehicle types
        const rawVTypes = (row.vehicleTypes || "TWO_WHEELER,FOUR_WHEELER_CAR")
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter((s) => s.length > 0);
        const parsedVTypes = [];
        for (const v of rawVTypes) {
            if (["TWO_WHEELER", "FOUR_WHEELER_CAR", "COMMERCIAL_LIGHT", "EV_TWO_WHEELER", "EV_FOUR_WHEELER"].includes(v)) {
                parsedVTypes.push(v);
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
        let lat = typeof row.lat === "number" ? row.lat : parseFloat(row.lat);
        let lng = typeof row.lng === "number" ? row.lng : parseFloat(row.lng);
        if (isNaN(lat) || isNaN(lng)) {
            lat = 28.4595 + (Math.random() - 0.5) * 0.05; // Sector 29 Gurugram locality
            lng = 77.0266 + (Math.random() - 0.5) * 0.05;
        }
        if (rowErrors.length > 0) {
            invalidRows.push({
                rowIndex: index + 1,
                data: row,
                errors: rowErrors,
            });
        }
        else {
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
            const profile = {
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
async function handleAdminCancelOrReassign(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["ADMIN"]);
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
        }).catch(() => { });
    }
    else if (data.action === "REASSIGN") {
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
        (0, dispatchEngine_1.dispatchServiceRequest)(db, data.requestId, (request?.dispatchBatch || 1) + 1).catch(console.error);
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
function cleanPhone(raw) {
    const digits = raw.replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
}
//# sourceMappingURL=mechanicAdmin.js.map