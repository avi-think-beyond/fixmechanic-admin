/**
 * Push Notification Service (FCM)
 * Safely delivers push notifications to registered device tokens.
 * Never leaks sensitive customer phone numbers or private exact addresses in payloads.
 */
import * as admin from "firebase-admin";
import { UserRole } from "./types";

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendNotificationToUser(
  db: admin.firestore.Firestore,
  userId: string,
  expectedRole: UserRole,
  payload: NotificationPayload
): Promise<{ success: boolean; deliveredCount: number }> {
  try {
    const tokensSnapshot = await db
      .collection("deviceTokens")
      .where("userId", "==", userId)
      .where("role", "==", expectedRole)
      .get();

    if (tokensSnapshot.empty) {
      console.log(`[FCM] No registered device tokens for user ${userId} (${expectedRole})`);
      return { success: false, deliveredCount: 0 };
    }

    const tokens: string[] = [];
    const docIds: string[] = [];
    tokensSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token) {
        tokens.push(data.token);
        docIds.push(doc.id);
      }
    });

    if (tokens.length === 0) return { success: false, deliveredCount: 0 };

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "fixmechanic_emergency",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    let deliveredCount = 0;

    // Remove invalid or dead tokens safely
    const staleDocPromises: Promise<admin.firestore.WriteResult>[] = [];
    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        deliveredCount++;
      } else if (
        resp.error?.code === "messaging/invalid-registration-token" ||
        resp.error?.code === "messaging/registration-token-not-registered"
      ) {
        console.warn(`[FCM] Purging invalid token doc: ${docIds[idx]}`);
        staleDocPromises.push(db.collection("deviceTokens").doc(docIds[idx]).delete());
      }
    });

    if (staleDocPromises.length > 0) {
      await Promise.all(staleDocPromises);
    }

    return { success: deliveredCount > 0, deliveredCount };
  } catch (error) {
    console.error(`[FCM Error] Failed sending to user ${userId}:`, error);
    return { success: false, deliveredCount: 0 };
  }
}
