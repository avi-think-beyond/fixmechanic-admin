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
exports.onUserCreated = exports.triggerOfferExpiryCheck = exports.adminCancelOrReassign = exports.processMechanicsCsv = exports.updateMechanicStatus = exports.sendJobChatMessage = exports.updateJobStatus = exports.acceptJobOffer = exports.createServiceRequest = void 0;
/**
 * FixMechanic Cloud Functions Entrypoint
 * Exports all trusted backend endpoints, triggers, and scheduled jobs.
 */
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
const requestService_1 = require("./requestService");
const atomicAcceptance_1 = require("./atomicAcceptance");
const jobStatusMachine_1 = require("./jobStatusMachine");
const chatService_1 = require("./chatService");
const mechanicAdmin_1 = require("./mechanicAdmin");
const dispatchEngine_1 = require("./dispatchEngine");
const auth_1 = require("./auth");
/**
 * 1. Customer Request Creation Endpoint
 */
exports.createServiceRequest = functions.https.onCall(async (data, context) => {
    return await (0, requestService_1.handleCreateServiceRequest)(data, context, db);
});
/**
 * 2. Atomic Job Acceptance Endpoint (Highest Priority)
 */
exports.acceptJobOffer = functions.https.onCall(async (data, context) => {
    return await (0, atomicAcceptance_1.handleAcceptJobOffer)(data, context, db);
});
/**
 * 3. Authoritative Job Status Machine Endpoint
 */
exports.updateJobStatus = functions.https.onCall(async (data, context) => {
    return await (0, jobStatusMachine_1.handleUpdateJobStatus)(data, context, db);
});
/**
 * 4. Private Job Chat Message Endpoint
 */
exports.sendJobChatMessage = functions.https.onCall(async (data, context) => {
    return await (0, chatService_1.handleSendJobChatMessage)(data, context, db);
});
/**
 * 5. Admin: Update Mechanic Verification Status (Approve/Reject/Suspend)
 */
exports.updateMechanicStatus = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleUpdateMechanicStatus)(data, context, db);
});
/**
 * 6. Admin: Process Mechanics CSV Import (Validate, Preview & Commit)
 */
exports.processMechanicsCsv = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleProcessMechanicsCsv)(data, context, db);
});
/**
 * 7. Admin: Emergency Cancel or Reassign Service Request
 */
exports.adminCancelOrReassign = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleAdminCancelOrReassign)(data, context, db);
});
/**
 * 8. Scheduled / HTTP Job: Check Offer Expirations and Expand Radius
 */
exports.triggerOfferExpiryCheck = functions.https.onCall(async (data, context) => {
    if (!data?.requestId) {
        throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
    }
    await (0, dispatchEngine_1.handleExpiredOffers)(db, data.requestId);
    return { success: true };
});
/**
 * 9. Auth Trigger: Initialize user record on account registration
 */
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
    const userRef = db.collection("users").doc(user.uid);
    const existing = await userRef.get();
    if (!existing.exists) {
        // Default new self-registrations to CUSTOMER unless provisioned by admin
        const role = "CUSTOMER";
        await userRef.set({
            uid: user.uid,
            role,
            email: user.email || null,
            phone: user.phoneNumber || null,
            displayName: user.displayName || "New User",
            createdAt: Date.now(),
        });
        await (0, auth_1.syncUserClaims)(user.uid, role);
    }
});
//# sourceMappingURL=index.js.map