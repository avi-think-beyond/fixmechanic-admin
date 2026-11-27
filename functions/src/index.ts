import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

import { handleCreateServiceRequest, handleRetryServiceRequest } from "./requestService";
import { handleAcceptJobOffer } from "./atomicAcceptance";
import { handleUpdateJobStatus } from "./jobStatusMachine";
import { handleSendJobChatMessage } from "./chatService";
import {
  handleUpdateMechanicStatus,
  handleProcessMechanicsCsv,
  handleAdminCancelOrReassign,
  handleUpdateApplicationConfig,
  handleUpdateMechanicLocation,
  handleSubmitJobRating,
} from "./mechanicAdmin";
import { handleExpiredOffers, handleRejectJobOffer } from "./dispatchEngine";
import { syncUserClaims } from "./auth";

export const createServiceRequest = functions.https.onCall(async (data, context) => {
  return await handleCreateServiceRequest(data, context, db);
});

export const retryServiceRequest = functions.https.onCall(async (data, context) => {
  return await handleRetryServiceRequest(data, context, db);
});

export const acceptJobOffer = functions.https.onCall(async (data, context) => {
  return await handleAcceptJobOffer(data, context, db);
});

export const rejectJobOffer = functions.https.onCall(async (data, context) => {
  return await handleRejectJobOffer(data, context, db);
});

export const updateJobStatus = functions.https.onCall(async (data, context) => {
  return await handleUpdateJobStatus(data, context, db);
});

export const sendJobChatMessage = functions.https.onCall(async (data, context) => {
  return await handleSendJobChatMessage(data, context, db);
});

export const submitJobRating = functions.https.onCall(async (data, context) => {
  return await handleSubmitJobRating(data, context, db);
});

export const updateMechanicLocation = functions.https.onCall(async (data, context) => {
  return await handleUpdateMechanicLocation(data, context, db);
});

export const updateMechanicStatus = functions.https.onCall(async (data, context) => {
  return await handleUpdateMechanicStatus(data, context, db);
});

export const processMechanicsCsv = functions.https.onCall(async (data, context) => {
  return await handleProcessMechanicsCsv(data, context, db);
});

export const adminCancelOrReassign = functions.https.onCall(async (data, context) => {
  return await handleAdminCancelOrReassign(data, context, db);
});

export const updateApplicationConfig = functions.https.onCall(async (data, context) => {
  return await handleUpdateApplicationConfig(data, context, db);
});

export const triggerOfferExpiryCheck = functions.https.onCall(async (data) => {
  if (!data?.requestId) {
    throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
  }
  return await handleExpiredOffers(db, data.requestId);
});

export const onUserCreated = functions.auth.user().onCreate(async (user) => {
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
    await syncUserClaims(user.uid, role).catch(() => {});
  }
});
