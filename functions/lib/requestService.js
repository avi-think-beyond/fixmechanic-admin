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
exports.handleCreateServiceRequest = handleCreateServiceRequest;
exports.handleRetryServiceRequest = handleRetryServiceRequest;
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
const config_1 = require("./config");
const dispatchEngine_1 = require("./dispatchEngine");
async function handleCreateServiceRequest(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["CUSTOMER", "ADMIN"]);
    const customerId = caller.uid;
    const vehicleType = (0, config_1.normalizeVehicleType)(data.vehicleType);
    const serviceCategory = (0, config_1.normalizeServiceCategory)(data.serviceCategory || data.issueTitle);
    const vehicleRegNumber = (data.vehicleRegNumber || "UNREGISTERED").trim().toUpperCase();
    if (typeof data.lat !== "number" ||
        typeof data.lng !== "number" ||
        isNaN(data.lat) ||
        isNaN(data.lng) ||
        data.lat < -90 ||
        data.lat > 90 ||
        data.lng < -180 ||
        data.lng > 180) {
        throw new functions.https.HttpsError("invalid-argument", "Valid GPS coordinates (latitude & longitude) are required.");
    }
    if (caller.role === "CUSTOMER") {
        const activeStatuses = [
            "REQUESTED",
            "SEARCHING",
            "ASSIGNED",
            "ACCEPTED",
            "EN_ROUTE",
            "ARRIVED",
            "IN_PROGRESS",
        ];
        const existingActiveSnapshot = await db
            .collection("serviceRequests")
            .where("customerId", "==", customerId)
            .where("status", "in", activeStatuses)
            .limit(1)
            .get();
        if (!existingActiveSnapshot.empty) {
            const existingReq = existingActiveSnapshot.docs[0];
            throw new functions.https.HttpsError("already-exists", `You already have an active roadside assistance request (#${existingReq.id.slice(0, 6)}). Please complete or cancel it before initiating a new one.`);
        }
    }
    const customerDoc = await db.collection("customerProfiles").doc(customerId).get();
    const userDoc = await db.collection("users").doc(customerId).get();
    const customerData = customerDoc.data();
    const userData = userDoc.data();
    const customerPhone = customerData?.phone || userData?.phone || caller.email || "Verified App User";
    const customerName = customerData?.name || userData?.displayName || (caller.role === "ADMIN" ? "Ops Simulation" : "Customer");
    const config = await (0, dispatchEngine_1.getApplicationConfig)(db);
    const requestId = db.collection("serviceRequests").doc().id;
    const now = Date.now();
    const geohash = (0, config_1.encodeGeohash)(data.lat, data.lng, 7);
    const newRequest = {
        id: requestId,
        customerId,
        customerName,
        customerPhone,
        vehicleType,
        vehicleMakeModel: (data.vehicleMakeModel || "Vehicle").trim(),
        vehicleRegNumber,
        serviceCategory,
        issueTitle: (data.issueTitle || serviceCategory).trim(),
        description: data.description ? data.description.trim().slice(0, 500) : "",
        photoUri: data.photoUri || null,
        estimatedPriceInr: typeof data.estimatedPriceInr === "number" ? data.estimatedPriceInr : 349,
        finalPartsFee: 0,
        totalPaid: 0,
        location: {
            lat: data.lat,
            lng: data.lng,
            address: data.address || "Reported Location via GPS",
            landmark: data.landmark || "",
            city: data.city || "Gurugram",
            geohash,
            isGpsAccurate: data.isGpsAccurate ?? true,
            updatedAt: now,
        },
        status: "SEARCHING",
        assignedMechanicId: null,
        assignedMechanicName: null,
        assignedMechanicPhoneMasked: null,
        assignedMechanicLocation: null,
        dispatchBatch: 1,
        searchRadiusKm: config.defaultSearchRadiusKm || config_1.DEFAULT_CONFIG.defaultSearchRadiusKm,
        createdAt: now,
        updatedAt: now,
    };
    const batch = db.batch();
    batch.set(db.collection("serviceRequests").doc(requestId), newRequest);
    const statusEventDoc = db.collection("jobStatusEvents").doc();
    batch.set(statusEventDoc, {
        id: statusEventDoc.id,
        requestId,
        fromStatus: "REQUESTED",
        toStatus: "SEARCHING",
        actorId: customerId,
        actorRole: caller.role,
        note: `Emergency request initiated for ${vehicleType} (${serviceCategory})`,
        timestamp: now,
    });
    await batch.commit();
    const dispatchResult = await (0, dispatchEngine_1.dispatchServiceRequest)(db, requestId, 1);
    return {
        success: true,
        requestId,
        status: dispatchResult.expired ? "EXPIRED" : "SEARCHING",
        dispatchedCount: dispatchResult.dispatchedCount,
        message: dispatchResult.dispatchedCount > 0
            ? `Request created and dispatched to ${dispatchResult.dispatchedCount} nearby mechanic(s).`
            : dispatchResult.message,
    };
}
async function handleRetryServiceRequest(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["CUSTOMER", "ADMIN"]);
    if (!data?.requestId) {
        throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
    }
    const reqRef = db.collection("serviceRequests").doc(data.requestId);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Service request not found.");
    }
    const req = reqDoc.data();
    if (caller.role === "CUSTOMER" && req.customerId !== caller.uid) {
        throw new functions.https.HttpsError("permission-denied", "You can only retry your own request.");
    }
    if (!["EXPIRED", "SEARCHING", "REQUESTED"].includes(req.status)) {
        throw new functions.https.HttpsError("failed-precondition", `Cannot retry request in status ${req.status}.`);
    }
    const now = Date.now();
    const nextBatch = req.status === "EXPIRED" ? 1 : (req.dispatchBatch || 1) + 1;
    await reqRef.update({
        status: "SEARCHING",
        dispatchBatch: nextBatch,
        updatedAt: now,
    });
    const eventRef = db.collection("jobStatusEvents").doc();
    await eventRef.set({
        id: eventRef.id,
        requestId: data.requestId,
        fromStatus: req.status,
        toStatus: "SEARCHING",
        actorId: caller.uid,
        actorRole: caller.role,
        note: `Retried mechanic dispatch (Batch ${nextBatch})`,
        timestamp: now,
    });
    const dispatchResult = await (0, dispatchEngine_1.dispatchServiceRequest)(db, data.requestId, nextBatch);
    return {
        success: true,
        requestId: data.requestId,
        status: dispatchResult.expired ? "EXPIRED" : "SEARCHING",
        dispatchedCount: dispatchResult.dispatchedCount,
        message: dispatchResult.message,
    };
}
//# sourceMappingURL=requestService.js.map