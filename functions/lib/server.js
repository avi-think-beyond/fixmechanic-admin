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
/**
 * Spark-Compatible Standalone HTTP Callable Server
 * Exposes all FixMechanic backend handlers over standard HTTP POST /:functionName
 * using Firebase Auth ID token verification (works on Firebase Spark free plan
 * without Cloud Functions deployment / Blaze billing).
 */
const http = __importStar(require("http"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const requestService_1 = require("./requestService");
const atomicAcceptance_1 = require("./atomicAcceptance");
const jobStatusMachine_1 = require("./jobStatusMachine");
const chatService_1 = require("./chatService");
const mechanicAdmin_1 = require("./mechanicAdmin");
const dispatchEngine_1 = require("./dispatchEngine");
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "fixmechanic-firebase",
    });
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const HANDLERS = {
    createServiceRequest: requestService_1.handleCreateServiceRequest,
    retryServiceRequest: requestService_1.handleRetryServiceRequest,
    acceptJobOffer: atomicAcceptance_1.handleAcceptJobOffer,
    rejectJobOffer: dispatchEngine_1.handleRejectJobOffer,
    updateJobStatus: jobStatusMachine_1.handleUpdateJobStatus,
    sendJobChatMessage: chatService_1.handleSendJobChatMessage,
    submitJobRating: mechanicAdmin_1.handleSubmitJobRating,
    updateMechanicLocation: mechanicAdmin_1.handleUpdateMechanicLocation,
    updateMechanicStatus: mechanicAdmin_1.handleUpdateMechanicStatus,
    processMechanicsCsv: mechanicAdmin_1.handleProcessMechanicsCsv,
    adminCancelOrReassign: mechanicAdmin_1.handleAdminCancelOrReassign,
    updateApplicationConfig: mechanicAdmin_1.handleUpdateApplicationConfig,
    triggerOfferExpiryCheck: async (data, _ctx, database) => {
        if (!data?.requestId) {
            throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
        }
        return await (0, dispatchEngine_1.handleExpiredOffers)(database, data.requestId);
    },
};
const HTTP_STATUS_BY_CODE = {
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
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}
function sendJson(res, statusCode, payload) {
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
        let callableAuth = undefined;
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
            rawRequest: req,
        };
        const result = await handler(data, context, db);
        sendJson(res, 200, { result });
    }
    catch (err) {
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
//# sourceMappingURL=server.js.map