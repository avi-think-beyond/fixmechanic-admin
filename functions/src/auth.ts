/**
 * Auth and Trusted Role Enforcement
 * Enforces server-side authority for CUSTOMER, MECHANIC, and ADMIN roles.
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { UserRole, MechanicApprovalStatus } from "./types";

export interface AuthenticatedUser {
  uid: string;
  role: UserRole;
  approvalStatus?: MechanicApprovalStatus;
  email?: string;
}

/**
 * Verify caller authentication and retrieve authoritative role from Firestore & Custom Claims
 */
export async function assertCallerRole(
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore,
  allowedRoles: UserRole[]
): Promise<AuthenticatedUser> {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required for this operation."
    );
  }

  const uid = context.auth.uid;
  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "User record not found in system."
    );
  }

  const userData = userDoc.data();
  if (userData?.disabled) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "User account is suspended or disabled."
    );
  }

  const role = userData?.role as UserRole;
  if (!allowedRoles.includes(role)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      `Access denied. Role ${role} is not authorized for this operation.`
    );
  }

  let approvalStatus: MechanicApprovalStatus | undefined;
  if (role === "MECHANIC") {
    const mechanicDoc = await db.collection("mechanicProfiles").doc(uid).get();
    approvalStatus = (mechanicDoc.data()?.approvalStatus as MechanicApprovalStatus) || "PENDING";
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
export async function syncUserClaims(
  uid: string,
  role: UserRole,
  approvalStatus?: MechanicApprovalStatus
): Promise<void> {
  const claims: Record<string, unknown> = {
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
