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
exports.handleUpdateApplicationConfig = handleUpdateApplicationConfig;
exports.handleUpdateMechanicLocation = handleUpdateMechanicLocation;
exports.handleSubmitJobRating = handleSubmitJobRating;
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
const config_1 = require("./config");
const notifications_1 = require("./notifications");
const dispatchEngine_1 = require("./dispatchEngine");
async function handleUpdateMechanicStatus(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["ADMIN"]);
    const adminId = caller.uid;
    if (!data?.mechanicId || !data?.targetStatus) {
        throw new functions.https.HttpsError("invalid-argument", "Mechanic ID and target status are required.");
    }
    const validStatuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
    if (!validStatuses.includes(data.targetStatus)) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid target approval status.");
    }
    const mechRef = db.collection("mechanicProfiles").doc(data.mechanicId);
    const mechDoc = await mechRef.get();
    if (!mechDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Mechanic profile not found.");
    }
    const now = Date.now();
    const updateData = {
        approvalStatus: data.targetStatus,
        rejectionReason: data.reason || null,
        statusReason: data.reason || (data.targetStatus === "APPROVED" ? "Verified by Operations Admin" : null),
        verifiedAt: data.targetStatus === "APPROVED" ? now : null,
        verifiedBy: data.targetStatus === "APPROVED" ? adminId : null,
        updatedAt: now,
    };
    if (data.targetStatus !== "APPROVED") {
        updateData.isOnline = false;
    }
    await mechRef.update(updateData);
    await db.collection("users").doc(data.mechanicId).set({
        role: "MECHANIC",
        disabled: data.targetStatus === "SUSPENDED",
        updatedAt: now,
    }, { merge: true });
    await (0, auth_1.syncUserClaims)(data.mechanicId, "MECHANIC", data.targetStatus).catch((e) => console.warn("[syncUserClaims warning]", e));
    (0, notifications_1.sendNotificationToUser)(db, data.mechanicId, "MECHANIC", {
        title: `Account Status: ${data.targetStatus}`,
        body: data.targetStatus === "APPROVED"
            ? "Congratulations! Your mechanic account is approved. You may now go Online and accept requests."
            : `Your mechanic verification status was updated to ${data.targetStatus}. ${data.reason || ""}`,
        data: {
            type: "ACCOUNT_STATUS_CHANGED",
            approvalStatus: data.targetStatus,
        },
    }).catch((e) => console.error("[FCM Status Notification Error]", e));
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
async function handleProcessMechanicsCsv(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["ADMIN"]);
    const adminId = caller.uid;
    if (!Array.isArray(data?.rows) || data.rows.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "CSV data array is required and must not be empty.");
    }
    const existingSnapshot = await db.collection("mechanicProfiles").get();
    const existingPhones = new Set();
    existingSnapshot.forEach((doc) => {
        const p = doc.data().phone;
        if (p)
            existingPhones.add(cleanPhone(String(p)));
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
        if (!phone || !/^\d{10}$/.test(phone)) {
            rowErrors.push(`Invalid 10-digit phone number (${rawPhone}).`);
        }
        if (phone && existingPhones.has(phone)) {
            rowErrors.push(`Phone ${phone} already exists in mechanic database.`);
            duplicateCount++;
        }
        else if (phone && seenInBatchPhones.has(phone)) {
            rowErrors.push(`Phone ${phone} duplicated within CSV batch.`);
            duplicateCount++;
        }
        else if (phone) {
            seenInBatchPhones.add(phone);
        }
        const vTypesRaw = (row.vehicleTypes || "TWO_WHEELER,FOUR_WHEELER_CAR")
            .split(",")
            .map((s) => (0, config_1.normalizeVehicleType)(s))
            .filter((v, idx, arr) => arr.indexOf(v) === idx);
        const sCatsRaw = (row.serviceCategories || "FLAT_TYRE,BATTERY_JUMPSTART")
            .split(",")
            .map((s) => (0, config_1.normalizeServiceCategory)(s))
            .filter((s, idx, arr) => arr.indexOf(s) === idx);
        const lat = Number(row.lat) || config_1.DEFAULT_CONFIG.localityCenter.lat;
        const lng = Number(row.lng) || config_1.DEFAULT_CONFIG.localityCenter.lng;
        if (rowErrors.length > 0) {
            invalidRows.push({ rowIndex: index + 1, raw: row, errors: rowErrors });
        }
        else {
            const now = Date.now();
            const mechProfile = {
                name,
                phone,
                email: row.email ? row.email.trim() : "",
                approvalStatus: "PENDING",
                isOnline: false,
                isBusy: false,
                activeJobId: null,
                vehicleTypes: vTypesRaw.length > 0 ? vTypesRaw : ["TWO_WHEELER", "FOUR_WHEELER_CAR"],
                serviceCategories: sCatsRaw.length > 0 ? sCatsRaw : ["FLAT_TYRE"],
                serviceRadiusKm: 15,
                currentLocation: {
                    lat,
                    lng,
                    address: row.locality || config_1.DEFAULT_CONFIG.localityName,
                    geohash: (0, config_1.encodeGeohash)(lat, lng, 7),
                    updatedAt: now,
                },
                ratingAverage: 5.0,
                ratingCount: 0,
                totalCompletedJobs: 0,
                todayEarningsInr: 0,
                createdAt: now,
                updatedAt: now,
            };
            validRows.push({ rowIndex: index + 1, data: mechProfile });
        }
    });
    let importedCount = 0;
    if (data.commit && validRows.length > 0) {
        const batch = db.batch();
        validRows.forEach((item) => {
            const id = `mech_csv_${item.data.phone}_${Date.now().toString().slice(-4)}`;
            const ref = db.collection("mechanicProfiles").doc(id);
            batch.set(ref, { ...item.data, mechanicId: id });
            importedCount++;
        });
        await batch.commit();
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
        committed: Boolean(data.commit),
        validation: {
            totalRows: data.rows.length,
            validRows,
            invalidRows,
            duplicateCount,
        },
        importedCount,
    };
}
async function handleAdminCancelOrReassign(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["ADMIN"]);
    const adminId = caller.uid;
    if (!data?.requestId || !data?.action) {
        throw new functions.https.HttpsError("invalid-argument", "requestId and action are required.");
    }
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
                updatedAt: now,
            }).catch(() => { });
        }
        await db.collection("jobChats").doc(data.requestId).update({
            status: "CLOSED",
            closedAt: now,
            closedReason: `Admin cancelled: ${data.reason}`,
        }).catch(() => { });
        await db.collection("jobStatusEvents").add({
            id: db.collection("jobStatusEvents").doc().id,
            requestId: data.requestId,
            fromStatus: request.status,
            toStatus: "CANCELLED",
            actorId: adminId,
            actorRole: "ADMIN",
            note: data.reason || "Admin cancelled",
            timestamp: now,
        });
    }
    else if (data.action === "REASSIGN") {
        if (request?.assignedMechanicId) {
            await db.collection("mechanicProfiles").doc(request.assignedMechanicId).update({
                isBusy: false,
                activeJobId: null,
                updatedAt: now,
            }).catch(() => { });
        }
        const nextBatch = (request?.dispatchBatch || 1) + 1;
        await reqRef.update({
            status: "SEARCHING",
            assignedMechanicId: null,
            assignedMechanicName: null,
            assignedMechanicPhoneMasked: null,
            assignedMechanicLocation: null,
            dispatchBatch: nextBatch,
            updatedAt: now,
        });
        await db.collection("jobStatusEvents").add({
            id: db.collection("jobStatusEvents").doc().id,
            requestId: data.requestId,
            fromStatus: request.status,
            toStatus: "SEARCHING",
            actorId: adminId,
            actorRole: "ADMIN",
            note: data.reason || "Admin emergency reassignment",
            timestamp: now,
        });
        await (0, dispatchEngine_1.dispatchServiceRequest)(db, data.requestId, nextBatch).catch(console.error);
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
async function handleUpdateApplicationConfig(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["ADMIN"]);
    const configRef = db.collection("applicationConfig").doc("current");
    const existing = await configRef.get();
    const merged = {
        ...config_1.DEFAULT_CONFIG,
        ...(existing.exists ? existing.data() : {}),
        ...data,
    };
    await configRef.set(merged, { merge: true });
    await db.collection("adminAuditLogs").add({
        id: db.collection("adminAuditLogs").doc().id,
        adminId: caller.uid,
        adminEmail: caller.email,
        action: "CONFIG_UPDATED",
        targetType: "SYSTEM_CONFIG",
        targetId: "current",
        details: {
            defaultSearchRadiusKm: merged.defaultSearchRadiusKm,
            initialOfferBatchSize: merged.initialOfferBatchSize,
            offerTimeoutSeconds: merged.offerTimeoutSeconds,
        },
        timestamp: Date.now(),
    });
    return { success: true, config: merged };
}
async function handleUpdateMechanicLocation(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["MECHANIC"]);
    if (typeof data?.lat !== "number" || typeof data?.lng !== "number" || isNaN(data.lat) || isNaN(data.lng)) {
        throw new functions.https.HttpsError("invalid-argument", "Valid lat and lng are required.");
    }
    const now = Date.now();
    const geohash = (0, config_1.encodeGeohash)(data.lat, data.lng, 7);
    const mechRef = db.collection("mechanicProfiles").doc(caller.uid);
    const mechSnap = await mechRef.get();
    if (!mechSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Mechanic profile not found.");
    }
    const existingAddress = mechSnap.data()?.currentLocation?.address || "";
    await mechRef.update({
        "currentLocation.lat": data.lat,
        "currentLocation.lng": data.lng,
        "currentLocation.geohash": geohash,
        "currentLocation.address": data.address || existingAddress,
        "currentLocation.updatedAt": now,
        updatedAt: now,
    });
    const activeJobId = mechSnap.data()?.activeJobId;
    if (activeJobId) {
        await db
            .collection("serviceRequests")
            .doc(activeJobId)
            .update({
            assignedMechanicLocation: {
                lat: data.lat,
                lng: data.lng,
                updatedAt: now,
            },
            updatedAt: now,
        })
            .catch(() => { });
    }
    return { success: true, geohash, updatedAt: now };
}
async function handleSubmitJobRating(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["CUSTOMER"]);
    const score = Math.max(1, Math.min(5, Number(data?.score)));
    if (!data?.requestId || isNaN(score)) {
        throw new functions.https.HttpsError("invalid-argument", "Valid requestId and score (1-5) required.");
    }
    const reqRef = db.collection("serviceRequests").doc(data.requestId);
    const ratingRef = db.collection("ratings").doc(data.requestId);
    return await db.runTransaction(async (tx) => {
        const reqDoc = await tx.get(reqRef);
        if (!reqDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Service request not found.");
        }
        const req = reqDoc.data();
        if (req.customerId !== caller.uid) {
            throw new functions.https.HttpsError("permission-denied", "You can only rate your own request.");
        }
        if (!req.assignedMechanicId) {
            throw new functions.https.HttpsError("failed-precondition", "No assigned mechanic to rate.");
        }
        const existingRating = await tx.get(ratingRef);
        const mechRef = db.collection("mechanicProfiles").doc(req.assignedMechanicId);
        const mechDoc = await tx.get(mechRef);
        if (existingRating.exists) {
            return {
                success: true,
                newAverage: mechDoc.data()?.ratingAverage || score,
                newCount: mechDoc.data()?.ratingCount || 1,
            };
        }
        const oldAvg = mechDoc.data()?.ratingAverage || 5.0;
        const oldCount = mechDoc.data()?.ratingCount || 0;
        const newCount = oldCount + 1;
        const newAvg = Math.round(((oldAvg * oldCount + score) / newCount) * 100) / 100;
        const now = Date.now();
        tx.set(ratingRef, {
            id: data.requestId,
            requestId: data.requestId,
            customerId: caller.uid,
            mechanicId: req.assignedMechanicId,
            score,
            feedback: (data.feedback || "").trim().slice(0, 500),
            createdAt: now,
        });
        tx.update(reqRef, {
            ratingGiven: score,
            feedbackComment: (data.feedback || "").trim().slice(0, 500),
            updatedAt: now,
        });
        if (mechDoc.exists) {
            tx.update(mechRef, {
                ratingAverage: newAvg,
                ratingCount: newCount,
                updatedAt: now,
            });
        }
        return { success: true, newAverage: newAvg, newCount };
    });
}
function cleanPhone(raw) {
    const digits = raw.replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
}
//# sourceMappingURL=mechanicAdmin.js.map