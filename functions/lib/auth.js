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
exports.assertCallerRole = assertCallerRole;
exports.syncUserClaims = syncUserClaims;
/**
 * Auth and Trusted Role Enforcement
 * Enforces server-side authority for CUSTOMER, MECHANIC, and ADMIN roles.
 */
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * Verify caller authentication and retrieve authoritative role from Firestore & Custom Claims
 */
async function assertCallerRole(context, db, allowedRoles) {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required for this operation.");
    }
    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError("permission-denied", "User record not found in system.");
    }
    const userData = userDoc.data();
    if (userData?.disabled) {
        throw new functions.https.HttpsError("permission-denied", "User account is suspended or disabled.");
    }
    const role = userData?.role;
    if (!allowedRoles.includes(role)) {
        throw new functions.https.HttpsError("permission-denied", `Access denied. Role ${role} is not authorized for this operation.`);
    }
    let approvalStatus;
    if (role === "MECHANIC") {
        const mechanicDoc = await db.collection("mechanicProfiles").doc(uid).get();
        approvalStatus = mechanicDoc.data()?.approvalStatus || "PENDING";
    }
    return {
        uid,
        role,
        approvalStatus,
        email: context.auth.token.email || userData?.email,
    };
}
/**
 * Sync custom user claims when user record role is modified or set
 */
async function syncUserClaims(uid, role, approvalStatus) {
    const claims = {
        role,
        admin: role === "ADMIN",
        mechanic: role === "MECHANIC",
        customer: role === "CUSTOMER",
    };
    if (approvalStatus) {
        claims.approvalStatus = approvalStatus;
    }
    await admin.auth().setCustomUserClaims(uid, claims);
}
//# sourceMappingURL=auth.js.map