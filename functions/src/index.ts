/**
 * FixMechanic Cloud Functions Entrypoint
 * Exports all trusted backend endpoints, triggers, and scheduled jobs.
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

import { handleCreateServiceRequest } from "./requestService";
import { handleAcceptJobOffer } from "./atomicAcceptance";
import { handleUpdateJobStatus } from "./jobStatusMachine";
import { handleSendJobChatMessage } from "./chatService";
import {
  handleUpdateMechanicStatus,
  handleProcessMechanicsCsv,
  handleAdminCancelOrReassign,
} from "./mechanicAdmin";
import { handleExpiredOffers } from "./dispatchEngine";
import { syncUserClaims } from "./auth";

/**
 * 1. Customer Request Creation Endpoint
 */
export const createServiceRequest = functions.https.onCall(async (data, context) => {
  return await handleCreateServiceRequest(data, context, db);
});

/**
 * 2. Atomic Job Acceptance Endpoint (Highest Priority)
 */
export const acceptJobOffer = functions.https.onCall(async (data, context) => {
  return await handleAcceptJobOffer(data, context, db);
});

/**
 * 3. Authoritative Job Status Machine Endpoint
 */
export const updateJobStatus = functions.https.onCall(async (data, context) => {
  return await handleUpdateJobStatus(data, context, db);
});

/**
 * 4. Private Job Chat Message Endpoint
 */
export const sendJobChatMessage = functions.https.onCall(async (data, context) => {
  return await handleSendJobChatMessage(data, context, db);
});

/**
 * 5. Admin: Update Mechanic Verification Status (Approve/Reject/Suspend)
 */
export const updateMechanicStatus = functions.https.onCall(async (data, context) => {
  return await handleUpdateMechanicStatus(data, context, db);
});

/**
 * 6. Admin: Process Mechanics CSV Import (Validate, Preview & Commit)
 */
export const processMechanicsCsv = functions.https.onCall(async (data, context) => {
  return await handleProcessMechanicsCsv(data, context, db);
});

/**
 * 7. Admin: Emergency Cancel or Reassign Service Request
 */
export const adminCancelOrReassign = functions.https.onCall(async (data, context) => {
  return await handleAdminCancelOrReassign(data, context, db);
});

/**
 * 8. Scheduled / HTTP Job: Check Offer Expirations and Expand Radius
 */
export const triggerOfferExpiryCheck = functions.https.onCall(async (data, context) => {
  if (!data?.requestId) {
    throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
  }
  await handleExpiredOffers(db, data.requestId);
  return { success: true };
});

/**
 * 9. Auth Trigger: Initialize user record on account registration
 */
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
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
    await syncUserClaims(user.uid, role);
  }
});
