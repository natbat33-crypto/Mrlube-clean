"use client";

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";

import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";

import {
  initializeFirestore,
  setLogLevel,
} from "firebase/firestore";

// ---- ENV CONFIG ----

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// ---- SINGLETON APP ----

const app: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ---- AUTH ----
// Persistent login:
// 1. Try IndexedDB
// 2. Fall back to localStorage if IndexedDB isn't available

let auth: Auth;

try {
  auth = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
    ],
  });
} catch {
  // Auth may already exist during Next.js hot reload.
  auth = getAuth(app);
}

// app/page.tsx already waits for this.
// initializeAuth configures persistence synchronously,
// so keep this export without changing the rest of the app.

const authPersistenceReady: Promise<void> = Promise.resolve();

// ---- FIRESTORE ----

const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// ---- DEV LOGGING ----

if (process.env.NODE_ENV === "development") {
  setLogLevel("debug");
  console.log("Firebase initialized (project):", app.options.projectId);
}

// ---- EXPORTS ----

export {
  app,
  auth,
  db,
  firebaseConfig,
  authPersistenceReady,
};