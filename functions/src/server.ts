/**
 * Spark-Compatible Standalone HTTP Callable Server
 * Exposes all FixMechanic backend handlers over standard HTTP POST /:functionName
 * using Firebase Auth ID token verification (works on Firebase Spark free plan
 * without Cloud Functions deployment / Blaze billing).
 */
import * as http from "http";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

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

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "fixmechanic-firebase",
  });
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

type HandlerFn = (
  data: any,
  context: functions.https.CallableContext,
  db: admin.firestore.Firestore
) => Promise<unknown>;

const HANDLERS: Record<string, HandlerFn> = {
  createServiceRequest: handleCreateServiceRequest,
  retryServiceRequest: handleRetryServiceRequest,
  acceptJobOffer: handleAcceptJobOffer,
  rejectJobOffer: handleRejectJobOffer,
  updateJobStatus: handleUpdateJobStatus,
  sendJobChatMessage: handleSendJobChatMessage,
  submitJobRating: handleSubmitJobRating,
  updateMechanicLocation: handleUpdateMechanicLocation,
  updateMechanicStatus: handleUpdateMechanicStatus,
  processMechanicsCsv: handleProcessMechanicsCsv,
  adminCancelOrReassign: handleAdminCancelOrReassign,
  updateApplicationConfig: handleUpdateApplicationConfig,
  triggerOfferExpiryCheck: async (data, _ctx, database) => {
    if (!data?.requestId) {
      throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
    }
    return await handleExpiredOffers(database, data.requestId);
  },
};

const HTTP_STATUS_BY_CODE: Record<string, number> = {
  "invalid-argument": 400,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "already-exists": 409,
  aborted: 409,
  "failed-precondition": 412,
  "deadline-exceeded": 504,
  internal: 500,
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

const PORT = Number(process.env.PORT || 5055);

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const urlPath = (req.url || "/").split("?")[0].replace(/^\/+|\/+$/g, "");
  if (req.method === "GET" && (urlPath === "" || urlPath === "health")) {
    sendJson(res, 200, { status: "ok", service: "fixmechanic-spark-backend", handlers: Object.keys(HANDLERS) });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: { status: "invalid-argument", message: "Use POST /:functionName" } });
    return;
  }

  const handler = HANDLERS[urlPath];
  if (!handler) {
    sendJson(res, 404, { error: { status: "not-found", message: `Unknown backend endpoint: ${urlPath}` } });
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    let callableAuth: functions.https.CallableContext["auth"] = undefined;
    if (match && match[1]) {
      const decoded = await admin.auth().verifyIdToken(match[1]);
      callableAuth = {
        uid: decoded.uid,
        token: decoded,
      };
    }

    const raw = await readBody(req);
    const parsed = raw ? JSON.parse(raw) : {};
    const data = parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed;

    const context = {
      auth: callableAuth,
      rawRequest: req as any,
    } as functions.https.CallableContext;

    const result = await handler(data, context, db);
    sendJson(res, 200, { result });
  } catch (err: any) {
    if (err instanceof functions.https.HttpsError) {
      const status = HTTP_STATUS_BY_CODE[err.code] || 400;
      sendJson(res, status, {
        error: {
          status: err.code.toUpperCase().replace(/-/g, "_"),
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    console.error(`[Spark Backend Error] /${urlPath}:`, err);
    sendJson(res, 500, {
      error: {
        status: "INTERNAL",
        code: "internal",
        message: err?.message || "Internal server error",
      },
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FixMechanic Spark Backend listening on http://0.0.0.0:${PORT}`);
});
