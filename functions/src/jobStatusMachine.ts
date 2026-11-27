import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { ServiceRequest, ServiceRequestStatus, UserRole } from "./types";
import { assertCallerRole } from "./auth";
import { dispatchServiceRequest } from "./dispatchEngine";
import { sendNotificationToUser } from "./notifications";

export interface UpdateStatusInput {
  requestId: string;
  targetStatus: ServiceRequestStatus;
  note?: string;
  cancellationReason?: string;
  finalPartsFee?: number;
  totalPaid?: number;
}

const ALLOWED_TRANSITIONS: Record<
  ServiceRequestStatus,
  Array<{ to: ServiceRequestStatus; allowedRoles: UserRole[] }>
> = {
  REQUESTED: [
    { to: "SEARCHING", allowedRoles: ["ADMIN"] },
    { to: "CANCELLED", allowedRoles: ["CUSTOMER", "ADMIN"] },
  ],
  SEARCHING: [
    { to: "ASSIGNED", allowedRoles: ["ADMIN"] },
    { to: "CANCELLED", allowedRoles: ["CUSTOMER", "ADMIN"] },
    { to: "EXPIRED", allowedRoles: ["ADMIN"] },
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
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [
    { to: "SEARCHING", allowedRoles: ["CUSTOMER", "ADMIN"] },
    { to: "CANCELLED", allowedRoles: ["CUSTOMER", "ADMIN"] },
  ],
};

export async function handleUpdateJobStatus(
  data: UpdateStatusInput,
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore
): Promise<{ success: boolean; fromStatus: string; toStatus: string; message: string }> {
  const caller = await assertCallerRole(context, db, ["CUSTOMER", "MECHANIC", "ADMIN"]);
  const actorId = caller.uid;
  const actorRole = caller.role;

  if (!data?.requestId || !data?.targetStatus) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Request ID and target status are required."
    );
  }

  const reqRef = db.collection("serviceRequests").doc(data.requestId);
  let reopenDispatchBatch: number | null = null;
  let notifyTarget: { userId: string; role: UserRole; title: string; body: string } | null = null;

  const result = await db.runTransaction(async (transaction) => {
    const reqDoc = await transaction.get(reqRef);
    if (!reqDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Service request not found.");
    }

    const request = reqDoc.data() as ServiceRequest;
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

    if (actorRole === "CUSTOMER" && request.customerId !== actorId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You can only update your own service request."
      );
    }

    if (actorRole === "MECHANIC" && request.assignedMechanicId !== actorId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not the assigned mechanic for this job."
      );
    }

    const possibleTransitions = ALLOWED_TRANSITIONS[currentStatus] || [];
    const validTransition = possibleTransitions.find(
      (t) => t.to === targetStatus && t.allowedRoles.includes(actorRole)
    );
    if (!validTransition) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Invalid status transition from '${currentStatus}' to '${targetStatus}' by role '${actorRole}'.`
      );
    }

    const now = Date.now();

    // If MECHANIC cancels before IN_PROGRESS, release mechanic and reopen for redispatch
    if (actorRole === "MECHANIC" && targetStatus === "CANCELLED") {
      const nextBatch = (request.dispatchBatch || 1) + 1;
      reopenDispatchBatch = nextBatch;
      transaction.update(reqRef, {
        status: "SEARCHING",
        assignedMechanicId: null,
        assignedMechanicName: null,
        assignedMechanicPhoneMasked: null,
        assignedMechanicLocation: null,
        dispatchBatch: nextBatch,
        updatedAt: now,
      });
      const mechanicRef = db.collection("mechanicProfiles").doc(actorId);
      transaction.update(mechanicRef, {
        isBusy: false,
        activeJobId: null,
        updatedAt: now,
      });
      const eventRef = db.collection("jobStatusEvents").doc();
      transaction.set(eventRef, {
        id: eventRef.id,
        requestId: data.requestId,
        fromStatus: currentStatus,
        toStatus: "SEARCHING",
        actorId,
        actorRole,
        note: `Mechanic cancelled (${data.cancellationReason || data.note || "Unavailable"}); re-opened for dispatch.`,
        timestamp: now,
      });
      notifyTarget = {
        userId: request.customerId,
        role: "CUSTOMER",
        title: "Reassigning Mechanic",
        body: "Your assigned mechanic had to cancel. We are automatically matching the next nearest mechanic.",
      };
      return {
        success: true,
        fromStatus: currentStatus,
        toStatus: "SEARCHING",
        message: "Job released and re-opened for automatic redispatch.",
      };
    }

    const isTerminal = targetStatus === "COMPLETED" || targetStatus === "CANCELLED";
    const mechanicRef =
      isTerminal && request.assignedMechanicId
        ? db.collection("mechanicProfiles").doc(request.assignedMechanicId)
        : null;
    const chatRef = isTerminal ? db.collection("jobChats").doc(data.requestId) : null;

    // ALL transaction reads MUST precede ALL transaction writes
    const mechSnap = mechanicRef ? await transaction.get(mechanicRef) : null;
    const chatSnap = chatRef ? await transaction.get(chatRef) : null;

    const updatePayload: Partial<ServiceRequest> = {
      status: targetStatus,
      updatedAt: now,
    };

    if (targetStatus === "COMPLETED") {
      updatePayload.completedAt = now;
      if (typeof data.finalPartsFee === "number") updatePayload.finalPartsFee = data.finalPartsFee;
      if (typeof data.totalPaid === "number") updatePayload.totalPaid = data.totalPaid;
    } else if (targetStatus === "CANCELLED") {
      updatePayload.cancelledAt = now;
      updatePayload.cancelledBy = actorId;
      updatePayload.cancellationReason = data.cancellationReason || data.note || "Cancelled by user";
    }

    transaction.update(reqRef, updatePayload);

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

    if (isTerminal) {
      if (mechanicRef && mechSnap && mechSnap.exists) {
        const mechUpdate: Record<string, unknown> = {
          isBusy: false,
          activeJobId: null,
          updatedAt: now,
        };
        if (targetStatus === "COMPLETED") {
          const prevJobs = (mechSnap.data()?.totalCompletedJobs as number) || 0;
          const prevEarnings = (mechSnap.data()?.todayEarningsInr as number) || 0;
          const payout = data.totalPaid ?? request.estimatedPriceInr ?? 349;
          mechUpdate.totalCompletedJobs = prevJobs + 1;
          mechUpdate.todayEarningsInr = prevEarnings + payout;
        }
        transaction.update(mechanicRef, mechUpdate);
      }

      if (chatRef && chatSnap && chatSnap.exists) {
        transaction.update(chatRef, {
          status: "CLOSED",
          closedAt: now,
          closedReason: `Job entered terminal status ${targetStatus}`,
        });
      }
    }

    if (actorRole === "MECHANIC") {
      notifyTarget = {
        userId: request.customerId,
        role: "CUSTOMER",
        title: `Job Update: ${targetStatus.replace(/_/g, " ")}`,
        body: `Your mechanic updated your request status to ${targetStatus.replace(/_/g, " ")}.`,
      };
    } else if (actorRole === "CUSTOMER" && targetStatus === "CANCELLED" && request.assignedMechanicId) {
      notifyTarget = {
        userId: request.assignedMechanicId,
        role: "MECHANIC",
        title: "Job Cancelled by Customer",
        body: "The customer cancelled this emergency request. You are now available for new offers.",
      };
    }

    return {
      success: true,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      message: `Job status transitioned from ${currentStatus} to ${targetStatus}.`,
    };
  });

  if (reopenDispatchBatch !== null) {
    await dispatchServiceRequest(db, data.requestId, reopenDispatchBatch).catch(console.error);
  }

  if (notifyTarget) {
    const target = notifyTarget as { userId: string; role: UserRole; title: string; body: string };
    sendNotificationToUser(db, target.userId, target.role, {
      title: target.title,
      body: target.body,
      data: {
        requestId: data.requestId,
        type: "JOB_STATUS_CHANGED",
        status: result.toStatus,
      },
    }).catch(() => {});
  }

  return result;
}
