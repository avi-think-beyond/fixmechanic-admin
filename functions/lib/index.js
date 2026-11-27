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
exports.onUserCreated = exports.triggerOfferExpiryCheck = exports.updateApplicationConfig = exports.adminCancelOrReassign = exports.processMechanicsCsv = exports.updateMechanicStatus = exports.updateMechanicLocation = exports.submitJobRating = exports.sendJobChatMessage = exports.updateJobStatus = exports.rejectJobOffer = exports.acceptJobOffer = exports.retryServiceRequest = exports.createServiceRequest = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const requestService_1 = require("./requestService");
const atomicAcceptance_1 = require("./atomicAcceptance");
const jobStatusMachine_1 = require("./jobStatusMachine");
const chatService_1 = require("./chatService");
const mechanicAdmin_1 = require("./mechanicAdmin");
const dispatchEngine_1 = require("./dispatchEngine");
const auth_1 = require("./auth");
exports.createServiceRequest = functions.https.onCall(async (data, context) => {
    return await (0, requestService_1.handleCreateServiceRequest)(data, context, db);
});
exports.retryServiceRequest = functions.https.onCall(async (data, context) => {
    return await (0, requestService_1.handleRetryServiceRequest)(data, context, db);
});
exports.acceptJobOffer = functions.https.onCall(async (data, context) => {
    return await (0, atomicAcceptance_1.handleAcceptJobOffer)(data, context, db);
});
exports.rejectJobOffer = functions.https.onCall(async (data, context) => {
    return await (0, dispatchEngine_1.handleRejectJobOffer)(data, context, db);
});
exports.updateJobStatus = functions.https.onCall(async (data, context) => {
    return await (0, jobStatusMachine_1.handleUpdateJobStatus)(data, context, db);
});
exports.sendJobChatMessage = functions.https.onCall(async (data, context) => {
    return await (0, chatService_1.handleSendJobChatMessage)(data, context, db);
});
exports.submitJobRating = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleSubmitJobRating)(data, context, db);
});
exports.updateMechanicLocation = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleUpdateMechanicLocation)(data, context, db);
});
exports.updateMechanicStatus = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleUpdateMechanicStatus)(data, context, db);
});
exports.processMechanicsCsv = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleProcessMechanicsCsv)(data, context, db);
});
exports.adminCancelOrReassign = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleAdminCancelOrReassign)(data, context, db);
});
exports.updateApplicationConfig = functions.https.onCall(async (data, context) => {
    return await (0, mechanicAdmin_1.handleUpdateApplicationConfig)(data, context, db);
});
exports.triggerOfferExpiryCheck = functions.https.onCall(async (data) => {
    if (!data?.requestId) {
        throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
    }
    return await (0, dispatchEngine_1.handleExpiredOffers)(db, data.requestId);
});
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
    const userRef = db.collection("users").doc(user.uid);
    const existing = await userRef.get();
    if (!existing.exists) {
        const role = "CUSTOMER";
        await userRef.set({
            uid: user.uid,
            role,
            email: user.email || null,
            phone: user.phoneNumber || null,
            displayName: user.displayName || "New User",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await (0, auth_1.syncUserClaims)(user.uid, role).catch(() => { });
    }
});
//# sourceMappingURL=index.js.map