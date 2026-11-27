# FixMechanic Admin Console & Unified Dispatch Backend

Shared **Node/TypeScript Dispatch Backend**, **Web Admin Operations Console**, and **Admin Android App** for the FixMechanic platform on Firebase project `fixmechanic-firebase` (`(default)` Firestore database).

---

## Components
1. **`functions/` (TypeScript Dispatch Engine & Spark HTTP Server)**:
   - Shared handlers in `src/dispatchEngine.ts`, `src/atomicAcceptance.ts`, `src/jobStatusMachine.ts`, `src/requestService.ts`, `src/chatService.ts`, `src/mechanicAdmin.ts`.
   - `src/server.ts`: Spark-compatible HTTP Callable server listening on port `5055` (`http://10.0.2.2:5055` for Android emulators).
   - `src/index.ts`: Firebase Cloud Functions exports for Blaze deployment.
2. **`web/` (Admin Web Operations Console)**:
   - Connects directly to Firebase Auth, `(default)` Firestore real-time listeners, and Spark HTTP endpoints (auto-detects local emulators on `localhost`/`127.0.0.1`).
3. **`app/` (Admin Native Android App)**:
   - Jetpack Compose app connecting to `(default)` Firestore, Firebase Auth, and Spark HTTP Callable server (`BuildConfig.BACKEND_BASE_URL`).

---

## Quick Verification Commands
```bash
# 1. Build & test backend functions
npm --prefix functions install && npm --prefix functions run build
node --test functions/tests/test_suite.js

# 2. Start Firebase Emulators + Spark Server, then run E2E tests
firebase emulators:start --config firebase.json --only auth,firestore --project fixmechanic-firebase
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=fixmechanic-firebase PORT=5055 node functions/lib/server.js
node --test functions/tests/e2e_emulator.test.js

# 3. Compile & test Admin Android App
gradle :app:compileDebugKotlin :app:testDebugUnitTest --console=plain
```
See `BACKEND_ARCHITECTURE.md` and `DEPLOYMENT.md` for full schema and Blaze upgrade steps.
