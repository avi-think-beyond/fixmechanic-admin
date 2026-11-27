/**
 * FixMechanic End-to-End Emulator Integration Tests
 * Requires:
 *  - Auth Emulator on 127.0.0.1:9099
 *  - Firestore Emulator on 127.0.0.1:8085
 *  - Spark Backend Server on 127.0.0.1:5055
 */
const { test, describe, before } = require("node:test");
const assert = require("node:assert");

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "fixmechanic-firebase";

const admin = require("firebase-admin");

const PROJECT_ID = "fixmechanic-firebase";
const AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const FS_EMU = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
const SPARK_URL = process.env.SPARK_BACKEND_URL || "http://127.0.0.1:5055";

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();

async function clearEmulators() {
  await fetch(`${FS_EMU}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
  });
  await fetch(`${AUTH_EMU}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE",
  });
}

async function createAuthUserAndToken(email, password, role, displayName) {
  const res = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok || !body.localId) {
    throw new Error(`Auth signUp failed: ${JSON.stringify(body)}`);
  }
  const uid = body.localId;
  await db.collection("users").doc(uid).set({
    uid,
    role,
    email,
    displayName,
    phone: "+919800000000",
    disabled: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  if (role === "ADMIN") {
    await admin.auth().setCustomUserClaims(uid, { role: "ADMIN", admin: true });
  } else if (role === "MECHANIC") {
    await admin.auth().setCustomUserClaims(uid, { role: "MECHANIC", mechanic: true });
  } else {
    await admin.auth().setCustomUserClaims(uid, { role: "CUSTOMER", customer: true });
  }
  // Refresh token so custom claims are present
  const signInRes = await fetch(
    `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const signInBody = await signInRes.json();
  return { uid, idToken: signInBody.idToken };
}

async function callSpark(fnName, data, idToken) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(`${SPARK_URL}/${fnName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
  });
  const json = await res.json();
  return { status: res.status, ok: res.ok, body: json };
}

async function fsRest(method, docPath, idToken, fieldsObj = null, updateMask = null) {
  const maskParam = updateMask
    ? `?${updateMask.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&")}`
    : "";
  const url = `${FS_EMU}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}${maskParam}`;
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const options = { method, headers };
  if (fieldsObj) {
    options.body = JSON.stringify({ fields: toFsFields(fieldsObj) });
  }
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: json };
}

function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFsValue) } };
  if (typeof val === "object") return { mapValue: { fields: toFsFields(val) } };
  return { stringValue: String(val) };
}

function toFsFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = toFsValue(v);
  }
  return out;
}

async function seedMechanicProfile(uid, overrides = {}) {
  const now = Date.now();
  await db.collection("mechanicProfiles").doc(uid).set({
    mechanicId: uid,
    name: overrides.name || "Mechanic Test",
    phone: overrides.phone || "9810123401",
    email: overrides.email || `${uid}@example.com`,
    approvalStatus: overrides.approvalStatus || "PENDING",
    isOnline: overrides.isOnline ?? false,
    isBusy: overrides.isBusy ?? false,
    activeJobId: overrides.activeJobId ?? null,
    vehicleTypes: overrides.vehicleTypes || ["TWO_WHEELER", "FOUR_WHEELER_CAR"],
    serviceCategories: overrides.serviceCategories || ["FLAT_TYRE", "BATTERY_JUMPSTART"],
    serviceRadiusKm: overrides.serviceRadiusKm ?? 15,
    currentLocation: overrides.currentLocation || {
      lat: 28.4682,
      lng: 77.0617,
      address: "Sector 29 Gurugram",
      geohash: "ttnf43z",
      updatedAt: now,
    },
    ratingAverage: overrides.ratingAverage ?? 5.0,
    ratingCount: overrides.ratingCount ?? 0,
    totalCompletedJobs: overrides.totalCompletedJobs ?? 0,
    todayEarningsInr: overrides.todayEarningsInr ?? 0,
    createdAt: now,
    updatedAt: now,
  });
}

describe("FixMechanic E2E Emulator & Spark Backend Suite", { concurrency: false }, () => {
  before(async () => {
    const health = await fetch(`${SPARK_URL}/health`).catch(() => null);
    assert.ok(health && health.ok, `Spark backend must be reachable at ${SPARK_URL}`);
  });

  test("1. Admin approval enables mechanic online toggle via Firestore rules", async () => {
    await clearEmulators();
    const adminUser = await createAuthUserAndToken("admin1@fix.in", "Pass@1234", "ADMIN", "Ops Admin");
    const mechUser = await createAuthUserAndToken("mech1@fix.in", "Pass@1234", "MECHANIC", "Rajesh Mech");
    await seedMechanicProfile(mechUser.uid, { name: "Rajesh Mech", approvalStatus: "PENDING", isOnline: false });

    // PENDING mechanic tries to go online directly -> Firestore rules MUST deny
    const deniedOnline = await fsRest(
      "PATCH",
      `mechanicProfiles/${mechUser.uid}`,
      mechUser.idToken,
      { isOnline: true },
      ["isOnline"]
    );
    assert.strictEqual(deniedOnline.ok, false, "PENDING mechanic must not be allowed to set isOnline=true");

    // Admin approves mechanic via Spark backend
    const approveRes = await callSpark(
      "updateMechanicStatus",
      { mechanicId: mechUser.uid, targetStatus: "APPROVED", reason: "Verified KYC" },
      adminUser.idToken
    );
    assert.strictEqual(approveRes.ok, true, JSON.stringify(approveRes.body));
    assert.strictEqual(approveRes.body.result.status, "APPROVED");

    // Approved mechanic toggles isOnline=true via client Firestore rules -> MUST succeed
    const allowedOnline = await fsRest(
      "PATCH",
      `mechanicProfiles/${mechUser.uid}`,
      mechUser.idToken,
      { isOnline: true },
      ["isOnline"]
    );
    assert.strictEqual(allowedOnline.ok, true, JSON.stringify(allowedOnline.body));
  });

  test("2. Bike + Flat Tyre dispatch targets only eligible nearby matching mechanics", async () => {
    await clearEmulators();
    const cust = await createAuthUserAndToken("cust2@fix.in", "Pass@1234", "CUSTOMER", "Ananya");
    await db.collection("customerProfiles").doc(cust.uid).set({
      uid: cust.uid,
      name: "Ananya Customer",
      phone: "9811223344",
    });

    const mechMatch = await createAuthUserAndToken("mech_match@fix.in", "Pass@1234", "MECHANIC", "Bike Puncture Pro");
    const mechCarOnly = await createAuthUserAndToken("mech_car@fix.in", "Pass@1234", "MECHANIC", "Car Only");
    const mechPending = await createAuthUserAndToken("mech_pend@fix.in", "Pass@1234", "MECHANIC", "Pending Mech");
    const mechOffline = await createAuthUserAndToken("mech_off@fix.in", "Pass@1234", "MECHANIC", "Offline Mech");
    const mechBusy = await createAuthUserAndToken("mech_busy@fix.in", "Pass@1234", "MECHANIC", "Busy Mech");

    await seedMechanicProfile(mechMatch.uid, {
      name: "Bike Puncture Pro",
      approvalStatus: "APPROVED",
      isOnline: true,
      isBusy: false,
      vehicleTypes: ["TWO_WHEELER", "FOUR_WHEELER_CAR"],
      serviceCategories: ["FLAT_TYRE"],
      currentLocation: { lat: 28.4600, lng: 77.0270, address: "Sector 29", geohash: "ttnf43z", updatedAt: Date.now() },
    });
    await seedMechanicProfile(mechCarOnly.uid, {
      name: "Car Only",
      approvalStatus: "APPROVED",
      isOnline: true,
      isBusy: false,
      vehicleTypes: ["FOUR_WHEELER_CAR"],
      serviceCategories: ["FLAT_TYRE"],
    });
    await seedMechanicProfile(mechPending.uid, {
      name: "Pending Mech",
      approvalStatus: "PENDING",
      isOnline: true,
      isBusy: false,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
    });
    await seedMechanicProfile(mechOffline.uid, {
      name: "Offline Mech",
      approvalStatus: "APPROVED",
      isOnline: false,
      isBusy: false,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
    });
    await seedMechanicProfile(mechBusy.uid, {
      name: "Busy Mech",
      approvalStatus: "APPROVED",
      isOnline: true,
      isBusy: true,
      activeJobId: "OTHER_JOB",
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
    });

    const createRes = await callSpark(
      "createServiceRequest",
      {
        vehicleType: "TWO_WHEELER",
        vehicleMakeModel: "Honda Activa 6G",
        vehicleRegNumber: "HR26-BK-1122",
        serviceCategory: "FLAT_TYRE",
        issueTitle: "Flat Tyre / Puncture Repair",
        lat: 28.4595,
        lng: 77.0266,
        address: "Sector 29 Market, Gurugram",
      },
      cust.idToken
    );

    assert.strictEqual(createRes.ok, true, JSON.stringify(createRes.body));
    const reqId = createRes.body.result.requestId;
    assert.strictEqual(createRes.body.result.dispatchedCount, 1);

    const offersSnap = await db.collection("jobOffers").where("requestId", "==", reqId).get();
    assert.strictEqual(offersSnap.size, 1);
    assert.strictEqual(offersSnap.docs[0].data().mechanicId, mechMatch.uid);
  });

  test("3. Concurrent acceptJobOffer race: strictly one winner and loser gets conflict", async () => {
    await clearEmulators();
    const cust = await createAuthUserAndToken("cust3@fix.in", "Pass@1234", "CUSTOMER", "Cust Race");
    const mechA = await createAuthUserAndToken("mechA@fix.in", "Pass@1234", "MECHANIC", "Mech A");
    const mechB = await createAuthUserAndToken("mechB@fix.in", "Pass@1234", "MECHANIC", "Mech B");

    await seedMechanicProfile(mechA.uid, {
      name: "Mech A",
      phone: "9810000001",
      approvalStatus: "APPROVED",
      isOnline: true,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
      currentLocation: { lat: 28.4596, lng: 77.0267, address: "Sec 29", geohash: "ttnf", updatedAt: Date.now() },
    });
    await seedMechanicProfile(mechB.uid, {
      name: "Mech B",
      phone: "9810000002",
      approvalStatus: "APPROVED",
      isOnline: true,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
      currentLocation: { lat: 28.4597, lng: 77.0268, address: "Sec 29", geohash: "ttnf", updatedAt: Date.now() },
    });

    const createRes = await callSpark(
      "createServiceRequest",
      {
        vehicleType: "TWO_WHEELER",
        serviceCategory: "FLAT_TYRE",
        lat: 28.4595,
        lng: 77.0266,
        address: "Sector 29 Hub",
      },
      cust.idToken
    );
    const reqId = createRes.body.result.requestId;
    const offersSnap = await db.collection("jobOffers").where("requestId", "==", reqId).get();
    assert.strictEqual(offersSnap.size, 2);

    const offerA = offersSnap.docs.find((d) => d.data().mechanicId === mechA.uid).id;
    const offerB = offersSnap.docs.find((d) => d.data().mechanicId === mechB.uid).id;

    const [resA, resB] = await Promise.all([
      callSpark("acceptJobOffer", { offerId: offerA, requestId: reqId }, mechA.idToken),
      callSpark("acceptJobOffer", { offerId: offerB, requestId: reqId }, mechB.idToken),
    ]);

    const okCount = [resA, resB].filter((r) => r.ok).length;
    const failCount = [resA, resB].filter((r) => !r.ok).length;
    assert.strictEqual(okCount, 1, `Expected 1 winner, got A=${resA.status} B=${resB.status}`);
    assert.strictEqual(failCount, 1);

    const reqDoc = (await db.collection("serviceRequests").doc(reqId).get()).data();
    assert.strictEqual(reqDoc.status, "ASSIGNED");
    const assignmentDoc = await db.collection("jobAssignments").doc(reqId).get();
    assert.strictEqual(assignmentDoc.exists, true);
    const chatDoc = await db.collection("jobChats").doc(reqId).get();
    assert.strictEqual(chatDoc.exists, true);
    assert.strictEqual(chatDoc.data().status, "OPEN");
  });

  test("4. Masked chat sanitization hides phone numbers", async () => {
    await clearEmulators();
    const cust = await createAuthUserAndToken("cust4@fix.in", "Pass@1234", "CUSTOMER", "Cust Chat");
    const mech = await createAuthUserAndToken("mech4@fix.in", "Pass@1234", "MECHANIC", "Mech Chat");
    await seedMechanicProfile(mech.uid, {
      name: "Mech Chat",
      approvalStatus: "APPROVED",
      isOnline: true,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
    });
    const createRes = await callSpark(
      "createServiceRequest",
      { vehicleType: "TWO_WHEELER", serviceCategory: "FLAT_TYRE", lat: 28.4682, lng: 77.0617 },
      cust.idToken
    );
    const reqId = createRes.body.result.requestId;
    const offerId = (await db.collection("jobOffers").where("requestId", "==", reqId).get()).docs[0].id;
    await callSpark("acceptJobOffer", { offerId, requestId: reqId }, mech.idToken);

    const msgRes = await callSpark(
      "sendJobChatMessage",
      { requestId: reqId, text: "Call me on +91 9876543210 right now" },
      cust.idToken
    );
    assert.strictEqual(msgRes.ok, true, JSON.stringify(msgRes.body));

    const msgsSnap = await db.collection("jobChats").doc(reqId).collection("jobMessages").get();
    assert.strictEqual(msgsSnap.size, 1);
    const savedText = msgsSnap.docs[0].data().text;
    assert.strictEqual(savedText.includes("9876543210"), false);
    assert.ok(savedText.includes("[Phone Number Protected]"));
  });

  test("5 & 6. Linear status state machine + job completion + rating transaction", async () => {
    await clearEmulators();
    const cust = await createAuthUserAndToken("cust5@fix.in", "Pass@1234", "CUSTOMER", "Cust Flow");
    const mech = await createAuthUserAndToken("mech5@fix.in", "Pass@1234", "MECHANIC", "Mech Flow");
    await seedMechanicProfile(mech.uid, {
      name: "Mech Flow",
      approvalStatus: "APPROVED",
      isOnline: true,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
      ratingAverage: 5.0,
      ratingCount: 0,
    });

    const createRes = await callSpark(
      "createServiceRequest",
      { vehicleType: "TWO_WHEELER", serviceCategory: "FLAT_TYRE", lat: 28.4682, lng: 77.0617, estimatedPriceInr: 400 },
      cust.idToken
    );
    const reqId = createRes.body.result.requestId;
    const offerId = (await db.collection("jobOffers").where("requestId", "==", reqId).get()).docs[0].id;
    await callSpark("acceptJobOffer", { offerId, requestId: reqId }, mech.idToken);

    // Illegal jump ASSIGNED -> COMPLETED must fail
    const badJump = await callSpark(
      "updateJobStatus",
      { requestId: reqId, targetStatus: "COMPLETED" },
      mech.idToken
    );
    assert.strictEqual(badJump.ok, false);
    assert.strictEqual(badJump.status, 412);

    // Valid linear sequence
    for (const next of ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"]) {
      const stepRes = await callSpark(
        "updateJobStatus",
        { requestId: reqId, targetStatus: next, totalPaid: next === "COMPLETED" ? 450 : undefined },
        mech.idToken
      );
      assert.strictEqual(stepRes.ok, true, `Failed transitioning to ${next}: ${JSON.stringify(stepRes.body)}`);
    }

    const mechDoc = (await db.collection("mechanicProfiles").doc(mech.uid).get()).data();
    assert.strictEqual(mechDoc.isBusy, false);
    assert.strictEqual(mechDoc.activeJobId, null);
    assert.strictEqual(mechDoc.totalCompletedJobs, 1);
    assert.strictEqual(mechDoc.todayEarningsInr, 450);

    const chatDoc = (await db.collection("jobChats").doc(reqId).get()).data();
    assert.strictEqual(chatDoc.status, "CLOSED");

    // Rating transaction
    const rateRes = await callSpark(
      "submitJobRating",
      { requestId: reqId, score: 4, feedback: "Fast puncture repair!" },
      cust.idToken
    );
    assert.strictEqual(rateRes.ok, true, JSON.stringify(rateRes.body));
    assert.strictEqual(rateRes.body.result.newAverage, 4);
    assert.strictEqual(rateRes.body.result.newCount, 1);

    const reqAfterRate = (await db.collection("serviceRequests").doc(reqId).get()).data();
    assert.strictEqual(reqAfterRate.ratingGiven, 4);
  });

  test("7. Admin CSV import, application config update, and cancel/reassign", async () => {
    await clearEmulators();
    const adminUser = await createAuthUserAndToken("admin7@fix.in", "Pass@1234", "ADMIN", "Admin Ops");
    const cust = await createAuthUserAndToken("cust7@fix.in", "Pass@1234", "CUSTOMER", "Cust 7");
    const mech = await createAuthUserAndToken("mech7@fix.in", "Pass@1234", "MECHANIC", "Mech 7");
    await seedMechanicProfile(mech.uid, {
      name: "Mech 7",
      phone: "9811111111",
      approvalStatus: "APPROVED",
      isOnline: true,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
    });

    const csvRes = await callSpark(
      "processMechanicsCsv",
      {
        commit: true,
        rows: [
          {
            name: "CSV Mech One",
            phone: "9822222221",
            email: "csv1@example.com",
            vehicleTypes: "TWO_WHEELER",
            serviceCategories: "FLAT_TYRE",
            locality: "Sector 29",
            lat: 28.46,
            lng: 77.03,
          },
          {
            name: "Dup Phone",
            phone: "9822222221",
          },
        ],
      },
      adminUser.idToken
    );
    assert.strictEqual(csvRes.ok, true, JSON.stringify(csvRes.body));
    assert.strictEqual(csvRes.body.result.importedCount, 1);

    const cfgRes = await callSpark(
      "updateApplicationConfig",
      { defaultSearchRadiusKm: 7.5, offerTimeoutSeconds: 60 },
      adminUser.idToken
    );
    assert.strictEqual(cfgRes.ok, true);
    assert.strictEqual(cfgRes.body.result.config.defaultSearchRadiusKm, 7.5);

    const reqRes = await callSpark(
      "createServiceRequest",
      { vehicleType: "TWO_WHEELER", serviceCategory: "FLAT_TYRE", lat: 28.4682, lng: 77.0617 },
      cust.idToken
    );
    const reqId = reqRes.body.result.requestId;
    const cancelRes = await callSpark(
      "adminCancelOrReassign",
      { requestId: reqId, action: "CANCEL", reason: "Duplicate test call" },
      adminUser.idToken
    );
    assert.strictEqual(cancelRes.ok, true);
    const reqDoc = (await db.collection("serviceRequests").doc(reqId).get()).data();
    assert.strictEqual(reqDoc.status, "CANCELLED");
  });

  test("8. Offer expiry expands dispatch batches and eventually transitions to EXPIRED", async () => {
    await clearEmulators();
    const cust = await createAuthUserAndToken("cust8@fix.in", "Pass@1234", "CUSTOMER", "Cust Expiry");
    const mech = await createAuthUserAndToken("mech8@fix.in", "Pass@1234", "MECHANIC", "Mech Expiry");
    await seedMechanicProfile(mech.uid, {
      name: "Mech Expiry Near",
      approvalStatus: "APPROVED",
      isOnline: true,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
      currentLocation: { lat: 28.4595, lng: 77.0266, address: "Sector 29", updatedAt: Date.now() },
    });
    const mechFar = await createAuthUserAndToken("mech8b@fix.in", "Pass@1234", "MECHANIC", "Mech Far");
    await seedMechanicProfile(mechFar.uid, {
      name: "Mech Expiry Far",
      approvalStatus: "APPROVED",
      isOnline: true,
      vehicleTypes: ["TWO_WHEELER"],
      serviceCategories: ["FLAT_TYRE"],
      currentLocation: { lat: 28.515, lng: 77.08, address: "DLF Phase 3 (~5.5km)", updatedAt: Date.now() },
    });
    await db.collection("applicationConfig").doc("current").set({
      defaultSearchRadiusKm: 5,
      maxSearchRadiusKm: 10,
      radiusExpansionStepKm: 5,
      initialOfferBatchSize: 3,
      offerTimeoutSeconds: 30,
      maxMechanicDispatchAttempts: 2,
      localityName: "Gurugram",
      localityCenter: { lat: 28.4595, lng: 77.0266 },
      maxMechanicLocationStalenessMinutes: 20,
      chatAutoCloseOnCompletion: true,
    });

    const createRes = await callSpark(
      "createServiceRequest",
      { vehicleType: "TWO_WHEELER", serviceCategory: "FLAT_TYRE", lat: 28.4682, lng: 77.0617 },
      cust.idToken
    );
    const reqId = createRes.body.result.requestId;

    // Force batch 1 offer expired -> check triggers batch 2
    let offers = await db.collection("jobOffers").where("requestId", "==", reqId).where("status", "==", "PENDING").get();
    for (const d of offers.docs) {
      await d.ref.update({ expiresAt: Date.now() - 5000 });
    }
    const check1 = await callSpark("triggerOfferExpiryCheck", { requestId: reqId }, cust.idToken);
    assert.strictEqual(check1.ok, true);
    assert.strictEqual(check1.body.result.expanded, true);

    // Force batch 2 offer expired -> maxMechanicDispatchAttempts=2 exhausted -> EXPIRED
    offers = await db.collection("jobOffers").where("requestId", "==", reqId).where("status", "==", "PENDING").get();
    for (const d of offers.docs) {
      await d.ref.update({ expiresAt: Date.now() - 5000 });
    }
    const check2 = await callSpark("triggerOfferExpiryCheck", { requestId: reqId }, cust.idToken);
    assert.strictEqual(check2.ok, true);
    assert.strictEqual(check2.body.result.expired, true);
    const reqDoc = (await db.collection("serviceRequests").doc(reqId).get()).data();
    assert.strictEqual(reqDoc.status, "EXPIRED");
  });

  test("9. Zero-trust Firestore security rules enforce role boundaries and field protection", async () => {
    await clearEmulators();
    const cust = await createAuthUserAndToken("cust9@fix.in", "Pass@1234", "CUSTOMER", "Cust Sec");
    const mech = await createAuthUserAndToken("mech9@fix.in", "Pass@1234", "MECHANIC", "Mech Sec");
    const otherMech = await createAuthUserAndToken("mech9b@fix.in", "Pass@1234", "MECHANIC", "Other Mech");
    await seedMechanicProfile(mech.uid, { approvalStatus: "PENDING", isOnline: false });

    // Customer cannot escalate own role to ADMIN
    const roleEsc = await fsRest("PATCH", `users/${cust.uid}`, cust.idToken, { role: "ADMIN" }, ["role"]);
    assert.strictEqual(roleEsc.ok, false);

    // Customer cannot create serviceRequests directly bypassing Spark backend
    const directReq = await fsRest("PATCH", "serviceRequests/REQ_ILLEGAL", cust.idToken, {
      id: "REQ_ILLEGAL",
      customerId: cust.uid,
      status: "SEARCHING",
    });
    assert.strictEqual(directReq.ok, false);

    // Mechanic cannot self-approve or alter ratingAverage
    const selfApprove = await fsRest(
      "PATCH",
      `mechanicProfiles/${mech.uid}`,
      mech.idToken,
      { approvalStatus: "APPROVED" },
      ["approvalStatus"]
    );
    assert.strictEqual(selfApprove.ok, false);

    // Seed offer for mech; otherMech cannot read it
    await db.collection("jobOffers").doc("OFFER_PRIVATE").set({
      id: "OFFER_PRIVATE",
      requestId: "REQ_SEC",
      mechanicId: mech.uid,
      status: "PENDING",
      offeredAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });
    const crossRead = await fsRest("GET", "jobOffers/OFFER_PRIVATE", otherMech.idToken);
    assert.strictEqual(crossRead.ok, false);

    // Seed chat between cust and mech; otherMech cannot read messages
    await db.collection("jobChats").doc("REQ_SEC").set({
      id: "REQ_SEC",
      requestId: "REQ_SEC",
      customerId: cust.uid,
      mechanicId: mech.uid,
      status: "OPEN",
      createdAt: Date.now(),
    });
    await db.collection("jobChats").doc("REQ_SEC").collection("jobMessages").doc("MSG1").set({
      id: "MSG1",
      chatId: "REQ_SEC",
      senderId: cust.uid,
      senderRole: "CUSTOMER",
      text: "Hello",
      timestamp: Date.now(),
    });
    const outsiderChatRead = await fsRest(
      "GET",
      "jobChats/REQ_SEC/jobMessages/MSG1",
      otherMech.idToken
    );
    assert.strictEqual(outsiderChatRead.ok, false);
  });
});
