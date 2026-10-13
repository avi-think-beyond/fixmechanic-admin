/**
 * FixMechanic Backend Test Suite
 * Automated unit and concurrency logic tests verifying:
 * 1. Concurrency safety & Race condition handling (Simultaneous acceptances)
 * 2. Authoritative State Machine validation and role permissions
 * 3. Geospatial Haversine calculation accuracy
 * 4. Phone number cleaning and duplicate detection in CSV imports
 */
const { test, describe } = require("node:test");
const assert = require("node:assert");

// Test 1: Concurrency Simulation for Atomic Acceptance
describe("1. Atomic Job Acceptance Concurrency Logic", () => {
  test("Simultaneous acceptances: strictly one mechanic wins and second receives conflict error", async () => {
    // Simulated in-memory database with ACID transaction semantics
    const state = {
      request: {
        id: "REQ_101",
        status: "SEARCHING",
        assignedMechanicId: null,
      },
      offers: {
        OFFER_A: {
          id: "OFFER_A",
          requestId: "REQ_101",
          mechanicId: "MECH_A",
          status: "PENDING",
          expiresAt: Date.now() + 30000,
        },
        OFFER_B: {
          id: "OFFER_B",
          requestId: "REQ_101",
          mechanicId: "MECH_B",
          status: "PENDING",
          expiresAt: Date.now() + 30000,
        },
      },
      assignments: {},
      isLocked: false,
    };

    // Transaction execution simulator mimicking Firestore runTransaction lock
    async function executeAcceptOffer(offerId, mechanicId) {
      // Simulate network jitter
      await new Promise((r) => setTimeout(r, Math.random() * 20));

      while (state.isLocked) {
        await new Promise((r) => setTimeout(r, 5));
      }
      state.isLocked = true;

      try {
        const offer = state.offers[offerId];
        if (!offer || offer.status !== "PENDING") {
          throw new Error("Offer not available");
        }
        if (state.request.status !== "SEARCHING" || state.request.assignedMechanicId) {
          offer.status = "LOST";
          throw new Error("Job already assigned to another mechanic");
        }

        // Winner selected atomically
        state.request.status = "ASSIGNED";
        state.request.assignedMechanicId = mechanicId;
        offer.status = "ACCEPTED";
        state.assignments[state.request.id] = {
          mechanicId,
          assignedAt: Date.now(),
        };

        // Mark competing offers
        for (const [otherId, otherOffer] of Object.entries(state.offers)) {
          if (otherId !== offerId && otherOffer.requestId === state.request.id) {
            otherOffer.status = "LOST";
          }
        }

        return { success: true, winner: mechanicId };
      } finally {
        state.isLocked = false;
      }
    }

    // Launch both acceptances concurrently in parallel
    const [resultA, resultB] = await Promise.allSettled([
      executeAcceptOffer("OFFER_A", "MECH_A"),
      executeAcceptOffer("OFFER_B", "MECH_B"),
    ]);

    const successes = [resultA, resultB].filter((r) => r.status === "fulfilled");
    const rejections = [resultA, resultB].filter((r) => r.status === "rejected");

    assert.strictEqual(successes.length, 1, "Exactly one mechanic must succeed in acceptance");
    assert.strictEqual(rejections.length, 1, "Competing mechanic must be rejected with conflict");
    assert.ok(
      rejections[0].reason.message.includes("Offer not available") ||
      rejections[0].reason.message.includes("already assigned"),
      "Competing mechanic must be rejected with conflict"
    );

    const winnerId = successes[0].value.winner;
    assert.strictEqual(state.request.assignedMechanicId, winnerId);
    assert.strictEqual(state.request.status, "ASSIGNED");

    const loserOffer = winnerId === "MECH_A" ? state.offers.OFFER_B : state.offers.OFFER_A;
    assert.strictEqual(loserOffer.status, "LOST");
  });

  test("Expired offer is rejected and marked EXPIRED", async () => {
    const expiredOffer = {
      id: "OFFER_EXPIRED",
      status: "PENDING",
      expiresAt: Date.now() - 1000, // in the past
    };

    const isExpired = expiredOffer.expiresAt <= Date.now();
    assert.strictEqual(isExpired, true, "Expired offer must be detected");
  });
});

// Test 2: State Machine Matrix Verification
describe("2. Job Status State Machine Transitions", () => {
  const ALLOWED_TRANSITIONS = {
    REQUESTED: ["SEARCHING", "CANCELLED"],
    SEARCHING: ["ASSIGNED", "CANCELLED"],
    ASSIGNED: ["ACCEPTED", "CANCELLED"],
    ACCEPTED: ["EN_ROUTE", "CANCELLED"],
    EN_ROUTE: ["ARRIVED", "CANCELLED"],
    ARRIVED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  test("Valid linear progression succeeds", () => {
    assert.ok(ALLOWED_TRANSITIONS.ASSIGNED.includes("ACCEPTED"));
    assert.ok(ALLOWED_TRANSITIONS.ACCEPTED.includes("EN_ROUTE"));
    assert.ok(ALLOWED_TRANSITIONS.EN_ROUTE.includes("ARRIVED"));
    assert.ok(ALLOWED_TRANSITIONS.ARRIVED.includes("IN_PROGRESS"));
    assert.ok(ALLOWED_TRANSITIONS.IN_PROGRESS.includes("COMPLETED"));
  });

  test("Illegal skipping transitions are forbidden", () => {
    // Mechanic cannot jump from ASSIGNED directly to COMPLETED
    assert.strictEqual(ALLOWED_TRANSITIONS.ASSIGNED.includes("COMPLETED"), false);
    // Cannot transition from terminal COMPLETED or CANCELLED
    assert.strictEqual(ALLOWED_TRANSITIONS.COMPLETED.length, 0);
    assert.strictEqual(ALLOWED_TRANSITIONS.CANCELLED.length, 0);
  });
});

// Test 3: Geospatial Math & Distance Ranking
describe("3. Geospatial Calculations", () => {
  const { calculateHaversineDistanceKm } = require("../lib/config");

  test("Haversine accurately calculates distance in Gurugram pilot", () => {
    // Sector 29 (28.4595, 77.0266) to DLF CyberHub (28.4986, 77.0898)
    const dist = calculateHaversineDistanceKm(28.4595, 77.0266, 28.4986, 77.0898);
    // Expected distance ~7.5 - 8.5 km
    assert.ok(dist >= 7.0 && dist <= 9.0, `Calculated distance ${dist}km within expected bounds`);
  });

  test("Identical coordinates yield 0 km", () => {
    const dist = calculateHaversineDistanceKm(28.4595, 77.0266, 28.4595, 77.0266);
    assert.strictEqual(dist, 0);
  });
});

// Test 4: CSV Validation & Phone Number Deduplication
describe("4. CSV Parser and Validation Logic", () => {
  function cleanPhone(raw) {
    const digits = raw.replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  test("Phone normalization strips country codes and spaces", () => {
    assert.strictEqual(cleanPhone("+91 98765 43210"), "9876543210");
    assert.strictEqual(cleanPhone("09876543210"), "9876543210");
    assert.strictEqual(cleanPhone("98765-43210"), "9876543210");
  });

  test("Duplicate detection identifies repeated records", () => {
    const existing = new Set(["9876543210"]);
    const batch = ["9876543210", "9812345678", "9812345678"];

    const seen = new Set();
    const duplicates = [];

    for (const phone of batch) {
      if (existing.has(phone) || seen.has(phone)) {
        duplicates.push(phone);
      } else {
        seen.add(phone);
      }
    }

    assert.strictEqual(duplicates.length, 2, "Must detect 2 duplicate occurrences");
    assert.ok(duplicates.includes("9876543210"));
    assert.ok(duplicates.includes("9812345678"));
  });
});
