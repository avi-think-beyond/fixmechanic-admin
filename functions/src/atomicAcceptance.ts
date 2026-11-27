import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { JobAssignment, JobOffer, MechanicProfile, ServiceRequest } from "./types";
import { assertCallerRole } from "./auth";
import { maskDisplayName, maskPhoneNumber } from "./config";
import { sendNotificationToUser } from "./notifications";

export interface AcceptJobOfferInput {
  offerId: string;
}

export interface AcceptJobOfferResult {
  success: boolean;
  requestId: string;
  assignedMechanicId: string;
  status: string;
  message: string;
  idempotent?: boolean;
}

export async function handleAcceptJobOffer(
  data: AcceptJobOfferInput,
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore
): Promise<AcceptJobOfferResult> {
  const caller = await assertCallerRole(context, db, ["MECHANIC"]);
  const mechanicId = caller.uid;

  if (!data?.offerId || typeof data.offerId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Offer ID is required.");
  }

  const offerRef = db.collection("jobOffers").doc(data.offerId);

  const result = await db.runTransaction(async (transaction) => {
    const offerDoc = await transaction.get(offerRef);
    if (!offerDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Job offer not found.");
    }
    const offer = offerDoc.data() as JobOffer;

    if (offer.status === "ACCEPTED" && offer.mechanicId === mechanicId) {
      return {
        success: true,
        requestId: offer.requestId,
        assignedMechanicId: mechanicId,
        status: "ASSIGNED",
        message: "You have already accepted this job.",
        idempotent: true,
        customerId: "",
        mechanicName: offer.mechanicName || "",
      };
    }

    if (offer.mechanicId !== mechanicId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "This offer was not dispatched to your account."
      );
    }

    if (offer.status !== "PENDING") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `This offer is no longer valid (Status: ${offer.status}).`
      );
    }

    const now = Date.now();
    if (offer.expiresAt <= now) {
      transaction.update(offerRef, { status: "EXPIRED", respondedAt: now });
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Job offer has expired. The job may be reassigned to another mechanic."
      );
    }

    const mechanicRef = db.collection("mechanicProfiles").doc(mechanicId);
    const reqRef = db.collection("serviceRequests").doc(offer.requestId);

    // Perform ALL transaction reads BEFORE writes
    const mechanicDoc = await transaction.get(mechanicRef);
    const reqDoc = await transaction.get(reqRef);

    if (!mechanicDoc.exists) {
      throw new functions.https.HttpsError("permission-denied", "Mechanic profile not found.");
    }
    const mechanic = mechanicDoc.data() as MechanicProfile;
    if (mechanic.approvalStatus !== "APPROVED") {
      throw new functions.https.HttpsError(
        "permission-denied",
        `Mechanic is not approved for live dispatches (Status: ${mechanic.approvalStatus}).`
      );
    }
    if (mechanic.isBusy || mechanic.activeJobId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "You already have an active roadside job in progress."
      );
    }

    if (!reqDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Service request not found.");
    }
    const request = reqDoc.data() as ServiceRequest;

    if (request.status !== "SEARCHING" && request.status !== "REQUESTED") {
      transaction.update(offerRef, { status: "LOST", respondedAt: now });
      throw new functions.https.HttpsError(
        "aborted",
        "This request has already been assigned to another mechanic."
      );
    }
    if (request.assignedMechanicId) {
      transaction.update(offerRef, { status: "LOST", respondedAt: now });
      throw new functions.https.HttpsError(
        "aborted",
        "This request has already been assigned to another mechanic."
      );
    }

    const maskedMechanicPhone = maskPhoneNumber(mechanic.phone);

    transaction.update(reqRef, {
      status: "ASSIGNED",
      assignedMechanicId: mechanicId,
      assignedMechanicName: mechanic.name,
      assignedMechanicPhoneMasked: maskedMechanicPhone,
      assignedMechanicLocation: mechanic.currentLocation || null,
      updatedAt: now,
    });

    transaction.update(offerRef, {
      status: "ACCEPTED",
      respondedAt: now,
    });

    transaction.update(mechanicRef, {
      isBusy: true,
      activeJobId: offer.requestId,
      updatedAt: now,
    });

    const assignmentRef = db.collection("jobAssignments").doc(offer.requestId);
    const assignment: JobAssignment = {
      id: offer.requestId,
      requestId: offer.requestId,
      mechanicId,
      customerId: request.customerId,
      customerDisplayName: maskDisplayName(request.customerName),
      customerPhoneMasked: maskPhoneNumber(request.customerPhone),
      vehicleType: request.vehicleType || "TWO_WHEELER",
      vehicleMakeModel: request.vehicleMakeModel || "Vehicle",
      vehicleRegNumber: request.vehicleRegNumber || "UNREGISTERED",
      serviceCategory: request.serviceCategory || "OTHER",
      issueTitle: request.issueTitle || request.serviceCategory || "Roadside Repair",
      estimatedPriceInr: request.estimatedPriceInr ?? 349,
      assignedAt: now,
      initialAcceptedAt: now,
    };
    transaction.set(assignmentRef, assignment);

    const statusEventRef = db.collection("jobStatusEvents").doc();
    transaction.set(statusEventRef, {
      id: statusEventRef.id,
      requestId: offer.requestId,
      fromStatus: request.status,
      toStatus: "ASSIGNED",
      actorId: mechanicId,
      actorRole: "MECHANIC",
      note: `Offer accepted by mechanic ${mechanic.name} (${mechanicId})`,
      timestamp: now,
    });

    const chatRef = db.collection("jobChats").doc(offer.requestId);
    transaction.set(chatRef, {
      id: offer.requestId,
      requestId: offer.requestId,
      customerId: request.customerId,
      mechanicId,
      status: "OPEN",
      createdAt: now,
    });

    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      id: auditRef.id,
      adminId: "SYSTEM",
      action: "JOB_ATOMICALLY_ASSIGNED",
      targetType: "SERVICE_REQUEST",
      targetId: offer.requestId,
      details: {
        winnerMechanicId: mechanicId,
        winnerMechanicName: mechanic.name,
        winningOfferId: data.offerId,
        timestamp: now,
      },
      timestamp: now,
    });

    return {
      success: true,
      requestId: offer.requestId,
      assignedMechanicId: mechanicId,
      status: "ASSIGNED",
      message: "Job offer accepted successfully! You are now assigned to this roadside request.",
      idempotent: false,
      customerId: request.customerId,
      mechanicName: mechanic.name,
    };
  });

  markCompetingOffersAsLost(db, result.requestId, data.offerId).catch((err) =>
    console.error("[Competing Offers Update Error]", err)
  );

  if (result.customerId) {
    sendNotificationToUser(db, result.customerId, "CUSTOMER", {
      title: "🚗 Mechanic Assigned!",
      body: `${result.mechanicName || "Your mechanic"} has accepted your roadside assistance request.`,
      data: {
        requestId: result.requestId,
        type: "MECHANIC_ASSIGNED",
        mechanicId,
      },
    }).catch((err) => console.error("[FCM Customer Notification Error]", err));
  }

  return {
    success: result.success,
    requestId: result.requestId,
    assignedMechanicId: result.assignedMechanicId,
    status: result.status,
    message: result.message,
    idempotent: result.idempotent,
  };
}

async function markCompetingOffersAsLost(
  db: admin.firestore.Firestore,
  requestId: string,
  winningOfferId: string
): Promise<void> {
  const competingOffers = await db
    .collection("jobOffers")
    .where("requestId", "==", requestId)
    .where("status", "==", "PENDING")
    .get();

  if (competingOffers.empty) return;

  const now = Date.now();
  const batch = db.batch();

  competingOffers.forEach((doc) => {
    if (doc.id !== winningOfferId) {
      batch.update(doc.ref, {
        status: "LOST",
        respondedAt: now,
      });

      const otherMechId = doc.data().mechanicId;
      sendNotificationToUser(db, otherMechId, "MECHANIC", {
        title: "Job Taken",
        body: "Another nearby mechanic has accepted this roadside request.",
        data: { requestId, type: "OFFER_LOST" },
      }).catch((e) => console.error("[FCM Competing Mechanic Error]", e));
    }
  });

  await batch.commit();
}
