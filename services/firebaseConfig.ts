// src/services/firebaseConfig.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// 🔒 Init sekali saja
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Provider hanya didefinisikan, TIDAK dipakai di sini
export const googleProvider = new GoogleAuthProvider();

// Backward-compatible helpers for legacy imports
export const firebaseSignInWithPopup = signInWithPopup;
export const firebaseSignInWithRedirect = signInWithRedirect;
export const firebaseSignOut = signOut;

export const ensureAuthPersistence = async (mode: "local" | "session" = "local") => {
  if (!auth) return;
  try {
    const persistence = mode === "session" ? browserSessionPersistence : browserLocalPersistence;
    await setPersistence(auth, persistence);
  } catch (error) {
    console.warn("[FIREBASE] Failed to set auth persistence.", error);
  }
};
