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
exports.handleUpdateJobStatus = handleUpdateJobStatus;
/**
 * Authoritative Job Status State Machine
 * Strictly enforces valid status transitions, role authorizations,
 * immutable audit history, mechanic availability updates, and chat closure.
 */
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
// Matrix of allowed state transitions and required roles
const ALLOWED_TRANSITIONS = {
    REQUESTED: [
        { to: "SEARCHING", allowedRoles: ["ADMIN", "SYSTEM"] },
        { to: "CANCELLED", allowedRoles: ["CUSTOMER", "ADMIN", "SYSTEM"] },
    ],
    SEARCHING: [
        { to: "ASSIGNED", allowedRoles: ["ADMIN", "SYSTEM"] },
        { to: "CANCELLED", allowedRoles: ["CUSTOMER", "ADMIN", "SYSTEM"] },
    ],
    ASSIGNED: [
        { to: "ACCEPTED", allowedRoles: ["MECHANIC", "ADMIN"] },
        { to: "CANCELLED", allowedRoles: ["CUSTOMER", "MECHANIC", "ADMIN"] },
    ],
    ACCEPTED: [
        { to: "EN_ROUTE", allowedRoles: ["MECHANIC", "ADMIN"] },
        { to: "CANCELLED", allowedRoles: ["CUSTOMER", "MECHANIC", "ADMIN"] },
    ],
    EN_ROUTE: [
        { to: "ARRIVED", allowedRoles: ["MECHANIC", "ADMIN"] },
        // Customers can no longer freely cancel without admin review once mechanic is en route
        { to: "CANCELLED", allowedRoles: ["MECHANIC", "ADMIN"] },
    ],
    ARRIVED: [
        { to: "IN_PROGRESS", allowedRoles: ["MECHANIC", "ADMIN"] },
        { to: "CANCELLED", allowedRoles: ["MECHANIC", "ADMIN"] },
    ],
    IN_PROGRESS: [
        { to: "COMPLETED", allowedRoles: ["MECHANIC", "ADMIN"] },
        { to: "CANCELLED", allowedRoles: ["ADMIN"] },
    ],
    COMPLETED: [], // Terminal
    CANCELLED: [], // Terminal
};
async function handleUpdateJobStatus(data, context, db) {
    const caller = await (0, auth_1.assertCallerRole)(context, db, ["CUSTOMER", "MECHANIC", "ADMIN"]);
    const actorId = caller.uid;
    const actorRole = caller.role;
    if (!data.requestId || !data.targetStatus) {
        throw new functions.https.HttpsError("invalid-argument", "Request ID and target status are required.");
    }
    const reqRef = db.collection("serviceRequests").doc(data.requestId);
    return await db.runTransaction(async (transaction) => {
        const reqDoc = await transaction.get(reqRef);
        if (!reqDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Service request not found.");
        }
        const request = reqDoc.data();
        const currentStatus = request.status;
        const targetStatus = data.targetStatus;
        if (currentStatus === targetStatus) {
            return {
                success: true,
                fromStatus: currentStatus,
                toStatus: targetStatus,
                message: `Job is already in status ${targetStatus}.`,
            };
        }
        // Role-specific ownership checks
        if (actorRole === "CUSTOMER" && request.customerId !== actorId) {
            throw new functions.https.HttpsError("permission-denied", "You can only update your own service request.");
        }
        if (actorRole === "MECHANIC" && request.assignedMechanicId !== actorId) {
            throw new functions.https.HttpsError("permission-denied", "You are not the assigned mechanic for this job.");
        }
        // Check transition validity in state machine matrix
        const possibleTransitions = ALLOWED_TRANSITIONS[currentStatus] || [];
        const validTransition = possibleTransitions.find((t) => t.to === targetStatus && t.allowedRoles.includes(actorRole));
        if (!validTransition) {
            throw new functions.https.HttpsError("failed-precondition", `Invalid status transition from '${currentStatus}' to '${targetStatus}' by role '${actorRole}'.`);
        }
        const now = Date.now();
        const updatePayload = {
            status: targetStatus,
            updatedAt: now,
        };
        if (targetStatus === "COMPLETED") {
            updatePayload.completedAt = now;
        }
        else if (targetStatus === "CANCELLED") {
            updatePayload.cancelledAt = now;
            updatePayload.cancelledBy = actorId;
            updatePayload.cancellationReason = data.cancellationReason || data.note || "Cancelled by user";
        }
        transaction.update(reqRef, updatePayload);
        // Record immutable audit event
        const eventRef = db.collection("jobStatusEvents").doc();
        transaction.set(eventRef, {
            id: eventRef.id,
            requestId: data.requestId,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            actorId,
            actorRole,
            note: data.note || `Transition to ${targetStatus}`,
            timestamp: now,
        });
        // Terminal status cleanup
        if (targetStatus === "COMPLETED" || targetStatus === "CANCELLED") {
            // 1. Release assigned mechanic availability if assigned
            if (request.assignedMechanicId) {
                const mechanicRef = db.collection("mechanicProfiles").doc(request.assignedMechanicId);
                transaction.update(mechanicRef, {
                    isBusy: false,
                    activeJobId: null,
                });
            }
            // 2. Close private job chat
            const chatRef = db.collection("jobChats").doc(data.requestId);
            transaction.update(chatRef, {
                status: "CLOSED",
                closedAt: now,
                closedReason: `Job entered terminal status ${targetStatus}`,
            });
        }
        return {
            success: true,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            message: `Job status transitioned from ${currentStatus} to ${targetStatus}.`,
        };
    });
}
//# sourceMappingURL=jobStatusMachine.js.map