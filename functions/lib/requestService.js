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
/**
 * Trusted Customer Request Creation
 * Validates authenticated customer, checks locality constraints, prevents duplicate
 * submissions, records initial status event, and triggers the dispatch engine.
 */
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
const config_1 = require("./config");
const dispatchEngine_1 = require("./dispatchEngine");
const SUPPORTED_VEHICLE_TYPES = [
    "TWO_WHEELER",
    "FOUR_WHEELER_CAR",
    "COMMERCIAL_LIGHT",
    "EV_TWO_WHEELER",
    "EV_FOUR_WHEELER",
];
async function handleCreateServiceRequest(data, context, db) {
    // 1. Authenticate and verify role is CUSTOMER
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["CUSTOMER"]);
    const customerId = caller.uid;
    // 2. Validate input fields
    if (!data.vehicleType || !SUPPORTED_VEHICLE_TYPES.includes(data.vehicleType)) {
        throw new functions.https.HttpsError("invalid-argument", `Invalid vehicle type: ${data.vehicleType}`);
    }
    if (!data.vehicleRegNumber || data.vehicleRegNumber.trim().length < 3) {
        throw new functions.https.HttpsError("invalid-argument", "Valid vehicle registration number is required.");
    }
    if (!data.serviceCategory || data.serviceCategory.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Service category is required.");
    }
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
    // 3. Prevent duplicate active submissions (if customer already has an active request)
    const activeStatuses = ["REQUESTED", "SEARCHING", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
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
    // 4. Retrieve customer profile phone number for verified contact
    const customerDoc = await db.collection("customerProfiles").doc(customerId).get();
    const customerData = customerDoc.data();
    const customerPhone = customerData?.phone || caller.email || "Verified App User";
    const customerName = customerData?.name || "Customer";
    // 5. Build authoritative Service Request object
    const requestId = db.collection("serviceRequests").doc().id;
    const now = Date.now();
    const geohash = (0, config_1.encodeGeohash)(data.lat, data.lng, 7);
    const newRequest = {
        id: requestId,
        customerId: customerId, // Server authoritative, ignores any client parameter
        customerName,
        customerPhone,
        vehicleType: data.vehicleType,
        vehicleRegNumber: data.vehicleRegNumber.toUpperCase().trim(),
        serviceCategory: data.serviceCategory.trim(),
        description: data.description ? data.description.trim().slice(0, 500) : "",
        location: {
            lat: data.lat,
            lng: data.lng,
            address: data.address || "Reported Location via GPS",
            geohash,
            updatedAt: now,
        },
        status: "SEARCHING",
        assignedMechanicId: null, // Strictly server managed
        dispatchBatch: 1,
        searchRadiusKm: config_1.DEFAULT_CONFIG.defaultSearchRadiusKm,
        createdAt: now,
        updatedAt: now,
    };
    // 6. Write request and initial status event in a batch
    const batch = db.batch();
    batch.set(db.collection("serviceRequests").doc(requestId), newRequest);
    const statusEventDoc = db.collection("jobStatusEvents").doc();
    batch.set(statusEventDoc, {
        id: statusEventDoc.id,
        requestId,
        fromStatus: "REQUESTED",
        toStatus: "SEARCHING",
        actorId: customerId,
        actorRole: "CUSTOMER",
        note: `Emergency request initiated for ${data.vehicleType} (${data.serviceCategory})`,
        timestamp: now,
    });
    await batch.commit();
    console.log(`[Request Created] Request ${requestId} initiated by ${customerId}`);
    // 7. Trigger dispatch engine in background
    (0, dispatchEngine_1.dispatchServiceRequest)(db, requestId, 1).catch((err) => {
        console.error(`[Dispatch Trigger Error] Failed to dispatch ${requestId}:`, err);
    });
    return {
        success: true,
        requestId,
        status: "SEARCHING",
        message: "Request successfully created. Dispatching nearby mechanics...",
    };
}
//# sourceMappingURL=requestService.js.map