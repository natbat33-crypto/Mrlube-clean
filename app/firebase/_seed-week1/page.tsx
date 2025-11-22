import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDBBeNY4GMgvWy_PUA05abQZb_1pNXA0hE",
  authDomain: "mrlube-training.firebaseapp.com",
  projectId: "mrlube-training",
  storageBucket: "mrlube-training.appspot.com", // ✅ fixed
  messagingSenderId: "648267333151",
  appId: "1:648267333151:web:475fed4b2c497ceba4df2a",
  measurementId: "G-TNDDY9DCPR",
};

// ✅ initialize once, reuse if already initialized
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ export the services you need everywhere
export const db = getFirestore(app);
export const auth = getAuth(app);
export { app };
