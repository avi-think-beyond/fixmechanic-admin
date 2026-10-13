/**
 * Private Scoped Job Chat Service
 * Strictly restricts chat to the authenticated customer and assigned mechanic.
 * Rejects messages after chat is CLOSED (upon job completion, cancellation, or expiry).
 * Masks phone numbers to prevent off-platform disintermediation and preserve privacy.
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { JobChat, JobMessage } from "./types";
import { assertCallerRole } from "./auth";
import { sendNotificationToUser } from "./notifications";

export interface SendMessageInput {
  requestId: string;
  text: string;
}

// Regex to detect 10-digit phone patterns to prevent unverified off-platform leaking
const PHONE_PATTERN = /(\+?91[\-\s]?)?[6-9]\d{9}/g;

export async function handleSendJobChatMessage(
  data: SendMessageInput,
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore
): Promise<{ success: boolean; messageId: string; timestamp: number }> {
  const caller = await assertCallerRole(context, db, ["CUSTOMER", "MECHANIC"]);
  const senderId = caller.uid;
  const senderRole = caller.role;

  if (!data.requestId || !data.text || data.text.trim().length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Request ID and non-empty message text are required."
    );
  }

  const chatRef = db.collection("jobChats").doc(data.requestId);
  const chatDoc = await chatRef.get();

  if (!chatDoc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Job chat session does not exist. (A mechanic must be assigned first)."
    );
  }

  const chat = chatDoc.data() as JobChat;

  // 1. Enforce participant isolation
  const isAuthorizedParticipant =
    (senderRole === "CUSTOMER" && chat.customerId === senderId) ||
    (senderRole === "MECHANIC" && chat.mechanicId === senderId);

  if (!isAuthorizedParticipant) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not an authorized participant in this job chat session."
    );
  }

  // 2. Reject messages if chat is CLOSED
  if (chat.status === "CLOSED") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This chat session is closed. The job has already concluded."
    );
  }

  // 3. Sanitize content and mask raw phone numbers
  const sanitizedText = data.text.trim().slice(0, 1000).replace(PHONE_PATTERN, "[Phone Number Protected]");

  const now = Date.now();
  const messageRef = db
    .collection("jobChats")
    .doc(data.requestId)
    .collection("jobMessages")
    .doc();

  const message: JobMessage = {
    id: messageRef.id,
    chatId: data.requestId,
    senderId,
    senderRole,
    text: sanitizedText,
    timestamp: now,
  };

  await messageRef.set(message);

  // Send push notification to the recipient
  const recipientId = senderRole === "CUSTOMER" ? chat.mechanicId : chat.customerId;
  const recipientRole = senderRole === "CUSTOMER" ? "MECHANIC" : "CUSTOMER";

  sendNotificationToUser(db, recipientId, recipientRole, {
    title: `💬 New Message (${senderRole === "CUSTOMER" ? "Customer" : "Mechanic"})`,
    body: sanitizedText,
    data: {
      requestId: data.requestId,
      type: "JOB_CHAT_MESSAGE",
    },
  }).catch((e) => console.error("[FCM Chat Notification Error]", e));

  return {
    success: true,
    messageId: messageRef.id,
    timestamp: now,
  };
}
