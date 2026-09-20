"use client";

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
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
const auth = getAuth(app);

// Keep the Firebase user signed in between app launches.
// Other parts of the app can wait for this before checking auth.
const authPersistenceReady = setPersistence(
  auth,
  indexedDBLocalPersistence
).catch((err) => {
  console.warn("Auth persistence could not be set:", err);
});

// ---- FIRESTORE ----
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// ---- DEV LOGGING ----
if (process.env.NODE_ENV === "development") {
  setLogLevel("debug");
  console.log("Firebase initialized (project):", app.options.projectId);
}

export {
  app,
  auth,
  db,
  firebaseConfig,
  authPersistenceReady,
};