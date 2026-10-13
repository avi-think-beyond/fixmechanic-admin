/**
 * FixMechanic Dispatch Engine
 * Server-side mechanic matching with distance ranking, eligibility filters,
 * batch offers, expiration management, radius expansion, and operational logging.
 */
import * as admin from "firebase-admin";
import {
  ServiceRequest,
  MechanicProfile,
  JobOffer,
  ApplicationConfig,
} from "./types";
import { calculateHaversineDistanceKm, DEFAULT_CONFIG } from "./config";
import { sendNotificationToUser } from "./notifications";

export async function getApplicationConfig(
  db: admin.firestore.Firestore
): Promise<ApplicationConfig> {
  const configDoc = await db.collection("applicationConfig").doc("current").get();
  if (configDoc.exists) {
    return { ...DEFAULT_CONFIG, ...configDoc.data() } as ApplicationConfig;
  }
  return DEFAULT_CONFIG;
}

export interface CandidateEvaluation {
  mechanic: MechanicProfile;
  distanceKm: number;
}

export async function findEligibleMechanics(
  db: admin.firestore.Firestore,
  request: ServiceRequest,
  radiusKm: number,
  config: ApplicationConfig
): Promise<CandidateEvaluation[]> {
  const now = Date.now();
  const maxStalenessMs = config.maxMechanicLocationStalenessMinutes * 60 * 1000;

  // Query approved, online, available mechanics
  const querySnapshot = await db
    .collection("mechanicProfiles")
    .where("approvalStatus", "==", "APPROVED")
    .where("isOnline", "==", true)
    .where("isBusy", "==", false)
    .get();

  if (querySnapshot.empty) {
    return [];
  }

  // Fetch already offered mechanic IDs for this request to avoid duplicates
  const existingOffers = await db
    .collection("jobOffers")
    .where("requestId", "==", request.id)
    .get();

  const alreadyOfferedIds = new Set<string>();
  existingOffers.forEach((doc) => {
    alreadyOfferedIds.add(doc.data().mechanicId);
  });

  const candidates: CandidateEvaluation[] = [];

  for (const doc of querySnapshot.docs) {
    const mech = doc.data() as MechanicProfile;

    // 1. Skip if already offered in this or previous batch
    if (alreadyOfferedIds.has(mech.mechanicId)) {
      continue;
    }

    // 2. Check vehicle type compatibility
    if (
      mech.vehicleTypes &&
      mech.vehicleTypes.length > 0 &&
      !mech.vehicleTypes.includes(request.vehicleType)
    ) {
      continue;
    }

    // 3. Check service category compatibility
    if (
      mech.serviceCategories &&
      mech.serviceCategories.length > 0 &&
      !mech.serviceCategories.includes(request.serviceCategory)
    ) {
      continue;
    }

    // 4. Verify location presence and staleness
    if (!mech.currentLocation || !mech.currentLocation.lat || !mech.currentLocation.lng) {
      continue;
    }

    const locUpdatedAt = mech.currentLocation.updatedAt || 0;
    if (locUpdatedAt > 0 && now - locUpdatedAt > maxStalenessMs) {
      console.log(`[Dispatch] Mechanic ${mech.mechanicId} skipped: location stale (${Math.round((now - locUpdatedAt) / 60000)}m ago)`);
      continue;
    }

    // 5. Calculate Haversine distance
    const dist = calculateHaversineDistanceKm(
      request.location.lat,
      request.location.lng,
      mech.currentLocation.lat,
      mech.currentLocation.lng
    );

    if (dist <= radiusKm) {
      candidates.push({ mechanic: mech, distanceKm: dist });
    }
  }

  // Sort candidate mechanics by distance ascending (nearest first)
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates;
}

export async function dispatchServiceRequest(
  db: admin.firestore.Firestore,
  requestId: string,
  batchNumber: number = 1
): Promise<{ dispatchedCount: number; message: string }> {
  const config = await getApplicationConfig(db);
  const reqRef = db.collection("serviceRequests").doc(requestId);
  const reqDoc = await reqRef.get();

  if (!reqDoc.exists) {
    return { dispatchedCount: 0, message: "Request does not exist" };
  }

  const request = reqDoc.data() as ServiceRequest;

  // Halt dispatch if already assigned, cancelled or completed
  if (["ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(request.status)) {
    console.log(`[Dispatch] Request ${requestId} is already in state ${request.status}. Halting dispatch.`);
    return { dispatchedCount: 0, message: `Request is already ${request.status}` };
  }

  // Calculate search radius based on batch
  const currentRadius = Math.min(
    config.defaultSearchRadiusKm + (batchNumber - 1) * config.radiusExpansionStepKm,
    config.maxSearchRadiusKm
  );

  console.log(`[Dispatch] Searching mechanics for req ${requestId} (Batch ${batchNumber}, Radius ${currentRadius}km)`);

  const candidates = await findEligibleMechanics(db, request, currentRadius, config);

  if (candidates.length === 0) {
    console.warn(`[Dispatch Warning] No eligible mechanics found for req ${requestId} in batch ${batchNumber}`);

    // If max batches reached, log failed dispatch in admin audit logs
    if (batchNumber >= config.maxMechanicDispatchAttempts) {
      await db.collection("adminAuditLogs").add({
        id: db.collection("adminAuditLogs").doc().id,
        adminId: "SYSTEM",
        action: "DISPATCH_EXHAUSTED_NO_MECHANICS",
        targetType: "SERVICE_REQUEST",
        targetId: requestId,
        details: {
          batchesAttempted: batchNumber,
          radiusKm: currentRadius,
          vehicleType: request.vehicleType,
          serviceCategory: request.serviceCategory,
          locality: config.localityName,
        },
        timestamp: Date.now(),
      });
    }

    return {
      dispatchedCount: 0,
      message: `No eligible mechanics found within ${currentRadius}km.`,
    };
  }

  // Select up to initialOfferBatchSize candidates
  const selectedBatch = candidates.slice(0, config.initialOfferBatchSize);
  const now = Date.now();
  const expiresAt = now + config.offerTimeoutSeconds * 1000;

  const batchWrite = db.batch();

  for (const item of selectedBatch) {
    const offerId = db.collection("jobOffers").doc().id;
    const offer: JobOffer = {
      id: offerId,
      requestId,
      mechanicId: item.mechanic.mechanicId,
      mechanicName: item.mechanic.name,
      distanceKm: item.distanceKm,
      status: "PENDING",
      offeredAt: now,
      expiresAt,
    };
    batchWrite.set(db.collection("jobOffers").doc(offerId), offer);
  }

  // Update request with current batch and radius
  batchWrite.update(reqRef, {
    dispatchBatch: batchNumber,
    searchRadiusKm: currentRadius,
    updatedAt: now,
  });

  await batchWrite.commit();

  // Send push notification to the chosen mechanics
  for (const item of selectedBatch) {
    sendNotificationToUser(db, item.mechanic.mechanicId, "MECHANIC", {
      title: "🚨 New Roadside Job Offer!",
      body: `${request.vehicleType} needing ${request.serviceCategory} (~${item.distanceKm} km away). Accept within ${config.offerTimeoutSeconds}s.`,
      data: {
        requestId,
        type: "NEW_JOB_OFFER",
        expiresAt: expiresAt.toString(),
      },
    }).catch((err) => console.error(`[FCM Offer Error]`, err));
  }

  return {
    dispatchedCount: selectedBatch.length,
    message: `Dispatched ${selectedBatch.length} offers within ${currentRadius}km.`,
  };
}

/**
 * Handle expired offers and trigger subsequent batch expansion if unassigned
 */
export async function handleExpiredOffers(
  db: admin.firestore.Firestore,
  requestId: string
): Promise<void> {
  const reqRef = db.collection("serviceRequests").doc(requestId);
  const reqDoc = await reqRef.get();
  if (!reqDoc.exists) return;

  const request = reqDoc.data() as ServiceRequest;
  if (request.status !== "SEARCHING") return;

  const now = Date.now();
  const offersSnapshot = await db
    .collection("jobOffers")
    .where("requestId", "==", requestId)
    .where("status", "==", "PENDING")
    .get();

  let hasPendingNonExpired = false;
  const batchWrite = db.batch();

  offersSnapshot.forEach((doc) => {
    const offer = doc.data() as JobOffer;
    if (offer.expiresAt <= now) {
      batchWrite.update(doc.ref, { status: "EXPIRED", respondedAt: now });
    } else {
      hasPendingNonExpired = true;
    }
  });

  await batchWrite.commit();

  // If no remaining pending offers and still searching, expand radius to next batch
  if (!hasPendingNonExpired && request.status === "SEARCHING") {
    const nextBatch = (request.dispatchBatch || 1) + 1;
    const config = await getApplicationConfig(db);
    if (nextBatch <= config.maxMechanicDispatchAttempts) {
      console.log(`[Dispatch] Batch ${request.dispatchBatch} expired. Expanding to batch ${nextBatch}...`);
      await dispatchServiceRequest(db, requestId, nextBatch);
    } else {
      console.log(`[Dispatch] All dispatch attempts exhausted for ${requestId}.`);
    }
  }
}
