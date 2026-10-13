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
exports.sendNotificationToUser = sendNotificationToUser;
/**
 * Push Notification Service (FCM)
 * Safely delivers push notifications to registered device tokens.
 * Never leaks sensitive customer phone numbers or private exact addresses in payloads.
 */
const admin = __importStar(require("firebase-admin"));
async function sendNotificationToUser(db, userId, expectedRole, payload) {
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
        const tokens = [];
        const docIds = [];
        tokensSnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.token) {
                tokens.push(data.token);
                docIds.push(doc.id);
            }
        });
        if (tokens.length === 0)
            return { success: false, deliveredCount: 0 };
        const message = {
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
        const staleDocPromises = [];
        response.responses.forEach((resp, idx) => {
            if (resp.success) {
                deliveredCount++;
            }
            else if (resp.error?.code === "messaging/invalid-registration-token" ||
                resp.error?.code === "messaging/registration-token-not-registered") {
                console.warn(`[FCM] Purging invalid token doc: ${docIds[idx]}`);
                staleDocPromises.push(db.collection("deviceTokens").doc(docIds[idx]).delete());
            }
        });
        if (staleDocPromises.length > 0) {
            await Promise.all(staleDocPromises);
        }
        return { success: deliveredCount > 0, deliveredCount };
    }
    catch (error) {
        console.error(`[FCM Error] Failed sending to user ${userId}:`, error);
        return { success: false, deliveredCount: 0 };
    }
}
//# sourceMappingURL=notifications.js.map