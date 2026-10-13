# FixMechanic Backend & Admin Console — Deployment Guide

## 1. Prerequisites and Project Architecture

The FixMechanic architecture consists of:
- **Cloud Firestore**: High-durability NoSQL store with deny-by-default zero-trust security rules (`firestore.rules`).
- **Firebase Authentication**: User identity with server-managed custom claims (`role: 'CUSTOMER' | 'MECHANIC' | 'ADMIN'`).
- **Firebase Cloud Functions (TypeScript)**: Trusted business logic for customer request creation, geospatial dispatch matching, concurrency-safe atomic job acceptance, authoritative status machine enforcement, and admin fleet verification.
- **Firebase Cloud Messaging (FCM)**: Push notification dispatch for new offers, acceptance outcomes, status changes, and chat messages.
- **Admin Operations Console**:
  - **Web Dashboard**: Responsive browser-based console in `/web` deployable via Firebase Hosting.
  - **Android Native Admin App**: Jetpack Compose operations application for mobile fleet control and field dispatchers.

---

## 2. Firebase Configuration & Deployment Steps

### Step 2.1: Firebase Project Setup
1. Create a Firebase project at [https://console.firebase.google.com](https://console.firebase.google.com).
2. Enable the **Blaze (Pay-as-you-go)** billing plan (required by Google Cloud for Node.js 18+ Cloud Functions and external network calls, though remaining well within the generous monthly free tier of 2M function invocations).
3. Enable **Authentication** in Firebase Console:
   - Enable **Email/Password** and **Google Sign-In** under Sign-in method.
4. Enable **Cloud Firestore** in production mode:
   - Select cloud region (recommended: `asia-south1` for Mumbai/Delhi locality latency minimization).

### Step 2.2: Local Configuration & Firebase CLI
Install and authenticate Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
```

Link your project:
```bash
firebase use --add <your-firebase-project-id>
```

### Step 2.3: Deploying Firestore Security Rules & Composite Indexes
Deploy the security rules and composite indexes:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### Step 2.4: Compiling & Deploying Cloud Functions
Navigate to the functions directory, install dependencies, compile TypeScript, and deploy:
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### Step 2.5: Deploying Web Admin Dashboard
Deploy the responsive admin web console to Firebase Hosting:
```bash
firebase deploy --only hosting
```

---

## 3. Environment & Secret Configuration

1. **Service Account Credentials**:
   When running in Firebase Cloud Functions or Google Cloud Run, default application credentials (`admin.initializeApp()`) are injected automatically.
2. **Android Client Secrets**:
   Copy the `google-services.json` file downloaded from Firebase Console into `app/google-services.json`.

---

## 4. Bootstrapping Initial Admin Account

To promote the first administrative user safely without exposing elevated credentials:
```bash
# Using Firebase Admin Node.js CLI or Cloud Functions shell
npm --prefix functions run shell

# In functions shell:
admin.auth().getUserByEmail('admin@fixmechanic.in').then(u => {
  return admin.auth().setCustomUserClaims(u.uid, { role: 'ADMIN', admin: true });
});
```

---

## 5. Mechanic Onboarding & CSV Import Process

1. Open the Admin Console (Web or Android).
2. Navigate to **Mechanic Fleet**.
3. Click **CSV Import** and select `sample_mechanics.csv`.
4. The system validates:
   - Valid phone numbers (10 digits).
   - Duplicate prevention (against existing database and within batch).
   - Valid vehicle categories and service codes.
5. All newly imported mechanics begin strictly in **PENDING** approval status.
6. Admins review credentials and click **Approve** to activate the mechanic for live dispatches.
