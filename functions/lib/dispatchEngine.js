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
exports.getApplicationConfig = getApplicationConfig;
exports.findEligibleMechanics = findEligibleMechanics;
exports.dispatchServiceRequest = dispatchServiceRequest;
exports.handleExpiredOffers = handleExpiredOffers;
exports.handleRejectJobOffer = handleRejectJobOffer;
const functions = __importStar(require("firebase-functions"));
const config_1 = require("./config");
const notifications_1 = require("./notifications");
const auth_1 = require("./auth");
async function getApplicationConfig(db) {
    const configDoc = await db.collection("applicationConfig").doc("current").get();
    if (configDoc.exists) {
        return { ...config_1.DEFAULT_CONFIG, ...configDoc.data() };
    }
    return config_1.DEFAULT_CONFIG;
}
async function findEligibleMechanics(db, request, radiusKm, config) {
    const now = Date.now();
    const maxStalenessMs = config.maxMechanicLocationStalenessMinutes * 60 * 1000;
    const querySnapshot = await db
        .collection("mechanicProfiles")
        .where("approvalStatus", "==", "APPROVED")
        .where("isOnline", "==", true)
        .where("isBusy", "==", false)
        .get();
    if (querySnapshot.empty) {
        return [];
    }
    const existingOffers = await db
        .collection("jobOffers")
        .where("requestId", "==", request.id)
        .get();
    const alreadyOfferedIds = new Set();
    existingOffers.forEach((doc) => {
        alreadyOfferedIds.add(doc.data().mechanicId);
    });
    const reqVehicleType = (0, config_1.normalizeVehicleType)(request.vehicleType);
    const reqServiceCat = (0, config_1.normalizeServiceCategory)(request.serviceCategory);
    const candidates = [];
    for (const doc of querySnapshot.docs) {
        const mech = doc.data();
        const mechId = mech.mechanicId || doc.id;
        if (alreadyOfferedIds.has(mechId)) {
            continue;
        }
        const mechVehicleTypes = (mech.vehicleTypes || []).map((v) => (0, config_1.normalizeVehicleType)(v));
        if (mechVehicleTypes.length > 0 && !mechVehicleTypes.includes(reqVehicleType)) {
            continue;
        }
        const mechServices = (mech.serviceCategories || []).map((s) => (0, config_1.normalizeServiceCategory)(s));
        if (mechServices.length > 0 &&
            reqServiceCat !== "OTHER" &&
            !mechServices.includes(reqServiceCat) &&
            !mechServices.includes("OTHER")) {
            continue;
        }
        if (!mech.currentLocation ||
            typeof mech.currentLocation.lat !== "number" ||
            typeof mech.currentLocation.lng !== "number") {
            continue;
        }
        const locUpdatedAt = mech.currentLocation.updatedAt || 0;
        if (locUpdatedAt > 0 && now - locUpdatedAt > maxStalenessMs) {
            continue;
        }
        const dist = (0, config_1.calculateHaversineDistanceKm)(request.location.lat, request.location.lng, mech.currentLocation.lat, mech.currentLocation.lng);
        const maxAllowedKm = Math.min(radiusKm, mech.serviceRadiusKm || 50);
        if (dist <= maxAllowedKm) {
            candidates.push({ mechanic: { ...mech, mechanicId: mechId }, distanceKm: dist });
        }
    }
    candidates.sort((a, b) => a.distanceKm - b.distanceKm);
    return candidates;
}
async function dispatchServiceRequest(db, requestId, batchNumber = 1) {
    const config = await getApplicationConfig(db);
    const reqRef = db.collection("serviceRequests").doc(requestId);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
        return { dispatchedCount: 0, expired: false, message: "Request does not exist" };
    }
    const request = reqDoc.data();
    if (["ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(request.status)) {
        return { dispatchedCount: 0, expired: false, message: `Request is already ${request.status}` };
    }
    let candidates = [];
    let attemptBatch = batchNumber;
    let currentRadius = config.defaultSearchRadiusKm;
    while (attemptBatch <= config.maxMechanicDispatchAttempts) {
        currentRadius = Math.min(config.defaultSearchRadiusKm + (attemptBatch - 1) * config.radiusExpansionStepKm, config.maxSearchRadiusKm);
        candidates = await findEligibleMechanics(db, request, currentRadius, config);
        if (candidates.length > 0) {
            break;
        }
        attemptBatch++;
    }
    const now = Date.now();
    if (candidates.length === 0) {
        const reachedMax = attemptBatch > config.maxMechanicDispatchAttempts;
        if (reachedMax) {
            await reqRef.update({
                status: "EXPIRED",
                dispatchBatch: config.maxMechanicDispatchAttempts,
                searchRadiusKm: currentRadius,
                updatedAt: now,
            });
            const eventRef = db.collection("jobStatusEvents").doc();
            await eventRef.set({
                id: eventRef.id,
                requestId,
                fromStatus: request.status,
                toStatus: "EXPIRED",
                actorId: "SYSTEM",
                actorRole: "SYSTEM",
                note: `No eligible mechanics available within ${currentRadius}km after ${config.maxMechanicDispatchAttempts} batches.`,
                timestamp: now,
            });
            await db.collection("adminAuditLogs").add({
                id: db.collection("adminAuditLogs").doc().id,
                adminId: "SYSTEM",
                action: "DISPATCH_EXHAUSTED_NO_MECHANICS",
                targetType: "SERVICE_REQUEST",
                targetId: requestId,
                details: {
                    batchesAttempted: config.maxMechanicDispatchAttempts,
                    radiusKm: currentRadius,
                    vehicleType: request.vehicleType,
                    serviceCategory: request.serviceCategory,
                    locality: config.localityName,
                },
                timestamp: now,
            });
            (0, notifications_1.sendNotificationToUser)(db, request.customerId, "CUSTOMER", {
                title: "No Mechanics Available Nearby",
                body: "All nearby verified mechanics are currently occupied. Tap Retry Search to expand search radius.",
                data: { requestId, type: "DISPATCH_EXPIRED" },
            }).catch(() => { });
        }
        return {
            dispatchedCount: 0,
            expired: reachedMax,
            message: `No eligible mechanics found within ${currentRadius}km.`,
        };
    }
    const selectedBatch = candidates.slice(0, config.initialOfferBatchSize);
    const expiresAt = now + config.offerTimeoutSeconds * 1000;
    const batchWrite = db.batch();
    for (const item of selectedBatch) {
        const offerId = db.collection("jobOffers").doc().id;
        const offer = {
            id: offerId,
            requestId,
            mechanicId: item.mechanic.mechanicId,
            mechanicName: item.mechanic.name,
            distanceKm: item.distanceKm,
            vehicleType: request.vehicleType,
            vehicleMakeModel: request.vehicleMakeModel || request.vehicleType,
            serviceCategory: request.serviceCategory,
            issueTitle: request.issueTitle || request.serviceCategory,
            locality: request.location?.city || request.location?.address || config.localityName,
            estimatedPriceInr: request.estimatedPriceInr || 349,
            status: "PENDING",
            offeredAt: now,
            expiresAt,
        };
        batchWrite.set(db.collection("jobOffers").doc(offerId), offer);
    }
    batchWrite.update(reqRef, {
        status: "SEARCHING",
        dispatchBatch: attemptBatch,
        searchRadiusKm: currentRadius,
        updatedAt: now,
    });
    await batchWrite.commit();
    for (const item of selectedBatch) {
        (0, notifications_1.sendNotificationToUser)(db, item.mechanic.mechanicId, "MECHANIC", {
            title: "🚨 New Roadside Job Offer!",
            body: `${request.vehicleType} needing ${request.serviceCategory} (~${item.distanceKm} km away). Accept within ${config.offerTimeoutSeconds}s.`,
            data: {
                requestId,
                type: "NEW_JOB_OFFER",
                expiresAt: expiresAt.toString(),
            },
        }).catch((err) => console.error("[FCM Offer Error]", err));
    }
    return {
        dispatchedCount: selectedBatch.length,
        expired: false,
        message: `Dispatched ${selectedBatch.length} offers within ${currentRadius}km (Batch ${attemptBatch}).`,
    };
}
async function handleExpiredOffers(db, requestId) {
    const reqRef = db.collection("serviceRequests").doc(requestId);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists)
        return { expanded: false, expired: false, dispatchedCount: 0 };
    const request = reqDoc.data();
    if (request.status !== "SEARCHING") {
        return { expanded: false, expired: false, dispatchedCount: 0 };
    }
    const now = Date.now();
    const offersSnapshot = await db
        .collection("jobOffers")
        .where("requestId", "==", requestId)
        .where("status", "==", "PENDING")
        .get();
    let hasPendingNonExpired = false;
    const batchWrite = db.batch();
    offersSnapshot.forEach((doc) => {
        const offer = doc.data();
        if (offer.expiresAt <= now) {
            batchWrite.update(doc.ref, { status: "EXPIRED", respondedAt: now });
        }
        else {
            hasPendingNonExpired = true;
        }
    });
    await batchWrite.commit();
    if (!hasPendingNonExpired && request.status === "SEARCHING") {
        const nextBatch = (request.dispatchBatch || 1) + 1;
        const config = await getApplicationConfig(db);
        if (nextBatch <= config.maxMechanicDispatchAttempts) {
            const res = await dispatchServiceRequest(db, requestId, nextBatch);
            return { expanded: true, expired: res.expired, dispatchedCount: res.dispatchedCount };
        }
        else {
            await reqRef.update({ status: "EXPIRED", updatedAt: now });
            return { expanded: false, expired: true, dispatchedCount: 0 };
        }
    }
    return { expanded: false, expired: false, dispatchedCount: 0 };
}
async function handleRejectJobOffer(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["MECHANIC"]);
    if (!data?.offerId) {
        throw new functions.https.HttpsError("invalid-argument", "offerId is required.");
    }
    const offerRef = db.collection("jobOffers").doc(data.offerId);
    const offerDoc = await offerRef.get();
    if (!offerDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Offer not found.");
    }
    const offer = offerDoc.data();
    if (offer.mechanicId !== caller.uid) {
        throw new functions.https.HttpsError("permission-denied", "Cannot reject another mechanic's offer.");
    }
    if (offer.status !== "PENDING") {
        return { success: true, message: `Offer already ${offer.status}.` };
    }
    const now = Date.now();
    await offerRef.update({
        status: "REJECTED",
        respondedAt: now,
        rejectionReason: data.reason || "Declined by mechanic",
    });
    // Check if any other PENDING offers remain; if not, expand dispatch batch
    const remaining = await db
        .collection("jobOffers")
        .where("requestId", "==", offer.requestId)
        .where("status", "==", "PENDING")
        .get();
    if (remaining.empty) {
        const reqDoc = await db.collection("serviceRequests").doc(offer.requestId).get();
        if (reqDoc.exists && reqDoc.data()?.status === "SEARCHING") {
            const nextBatch = (reqDoc.data()?.dispatchBatch || 1) + 1;
            await dispatchServiceRequest(db, offer.requestId, nextBatch).catch(() => { });
        }
    }
    return { success: true, message: "Offer declined." };
}
//# sourceMappingURL=dispatchEngine.js.map