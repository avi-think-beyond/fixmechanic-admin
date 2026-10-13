# FixMechanic Backend Architecture & Security Specification

## 1. System Overview

FixMechanic is a dedicated emergency roadside assistance platform architected for high reliability and zero concurrency conflicts during mechanic dispatch. It provides a shared backend and admin operations console for two separate native mobile client applications:
1. **FixMechanic Customer App**
2. **FixMechanic Mechanic App**

---

## 2. Cloud Firestore Schema Specification

| Collection | Document ID | Purpose | Authorization Policy |
| :--- | :--- | :--- | :--- |
| `users` | `{userId}` (Auth UID) | Base user identity and trusted role (`CUSTOMER`, `MECHANIC`, `ADMIN`) | Owner can read; Admin can read all; writes strictly governed |
| `customerProfiles` | `{customerId}` | Customer contact, vehicle defaults | Owner read/write; Admin read; assigned mechanic read-only |
| `mechanicProfiles` | `{mechanicId}` | Verification status, availability (`isOnline`, `isBusy`), location, ratings | Public read for assigned/discovery; mechanic can only update online/location; Admin manages `approvalStatus` |
| `mechanicServiceAreas`| `{areaId}` | Geographic polygon / hub radius definition | Public read; Admin write |
| `serviceCategories` | `{categoryId}` | Services (e.g. `FLAT_TYRE`, `BATTERY_JUMPSTART`, `TOWING`) | Public read; Admin write |
| `serviceRequests` | `{requestId}` | Roadside assistance breakdown incident records | Customer read own; assigned mechanic read; writes strictly through Cloud Functions |
| `jobOffers` | `{offerId}` | Dispatch offers sent to candidate mechanics | Mechanic can only read offers targeted to their UID |
| `jobAssignments` | `{requestId}` | Authoritative record of winner mechanic assignment | Customer, assigned mechanic, and admin read only |
| `jobStatusEvents` | `{eventId}` | Immutable timeline audit of all status transitions | Participants and admin read |
| `jobChats` | `{requestId}` | Scoped chat container for active incident | Customer and assigned mechanic read |
| `jobMessages` | `{messageId}` (subcollection) | Messages exchanged between customer and mechanic | Participants read; create allowed only if chat is `OPEN` |
| `ratings` | `{ratingId}` | Customer reviews and star ratings | Public read; customer create |
| `deviceTokens` | `{tokenId}` | FCM push notification registration tokens | Owner and admin read/write |
| `adminAuditLogs` | `{logId}` | Immutable record of all administrative operations | Admin read/write only |
| `applicationConfig` | `current` | Configurable dispatch parameters (radius, batch size, timeout) | Public read; Admin write |

---

## 3. Authoritative Job State Machine

All transitions are strictly validated on the server by `updateJobStatus`:

```
[REQUESTED] ──(System Dispatch)──> [SEARCHING]
     │                                    │
     └──(Customer/Admin Cancel)           └──(Customer/Admin Cancel)
                                          │
                                   (Atomic Acceptance)
                                          │
                                          ▼
                                     [ASSIGNED]
                                          │
                                    (Mechanic Ack)
                                          │
                                          ▼
                                     [ACCEPTED]
                                          │
                                   (Mechanic Departs)
                                          │
                                          ▼
                                     [EN_ROUTE]
                                          │
                                    (Arrived On-Site)
                                          │
                                          ▼
                                     [ARRIVED]
                                          │
                                  (Commence Repairs)
                                          │
                                          ▼
                                   [IN_PROGRESS]
                                          │
                               (Customer/OTP Sign-off)
                                          │
                                          ▼
                                     [COMPLETED] (Terminal)
```

### Cancellation Matrix
- **Customer**: May cancel before mechanic is `EN_ROUTE`. Once `EN_ROUTE`, customer must contact support or wait.
- **Mechanic**: May cancel with recorded reason; system automatically re-opens request to `SEARCHING` and triggers next dispatch batch.
- **Admin**: May cancel at any stage via emergency intervention.

---

## 4. Atomic Job Acceptance Transaction (Highest Priority)

To eliminate race conditions when multiple mechanics accept the same request concurrently, `acceptJobOffer` runs inside a Firestore Transaction (`db.runTransaction`):
1. Reads offer and verifies `status == "PENDING"`.
2. Verifies `expiresAt > Date.now()`.
3. Verifies mechanic profile has `approvalStatus == "APPROVED"` and `!isBusy`.
4. Reads `serviceRequests` document and verifies `status == "SEARCHING"` and `assignedMechanicId == null`.
5. Atomically assigns request to the winner: `status = "ASSIGNED"`, `assignedMechanicId = mechanicId`.
6. Sets winning offer `status = "ACCEPTED"`.
7. Sets mechanic profile `isBusy = true`.
8. Creates `jobAssignments` and immutable `jobStatusEvents` records.
9. Creates `jobChats` record with `status = "OPEN"`.
10. Marks all competing offers for the same request as `LOST`.
11. Dispatches FCM notification to customer and notifies competing mechanics that job was taken.

---

## 5. Geospatial Matching Engine

- **Haversine Distance**: Computes great-circle distance between breakdown GPS and mechanic location.
- **Eligibility Checks**:
  1. `approvalStatus == "APPROVED"`.
  2. `isOnline == true && isBusy == false`.
  3. `now - location.updatedAt < maxStalenessMinutes * 60 * 1000`.
  4. Vehicle type and service category supported by mechanic.
  5. Distance `<= currentSearchRadiusKm`.
- **Ranking**: Nearest candidates sorted ascending by distance.
- **Batching & Expansion**:
  - Batch 1: Up to 3 nearest mechanics within 5 km.
  - Expiry: 45 seconds per batch.
  - Expansion: Increments radius by 3 km up to 15 km ceiling for subsequent batches.
