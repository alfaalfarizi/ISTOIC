// src/features/istok/services/istokIdentity.ts

import { auth, db, googleProvider } from "../../../services/firebaseConfig";
import {
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  User as FirebaseUser,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { debugService } from "../../../services/debugService";

export interface IStokUserIdentity {
  uid: string;
  istokId: string;
  codename: string;
  email: string;
  displayName: string;
  photoURL: string;
  lastIdChange?: any; // Firestore Timestamp
  idChangeCount?: number;
}

type LoginOutcome =
  | { status: "SIGNED_IN"; identity: IStokUserIdentity }
  | { status: "REDIRECT_STARTED" }
  | { status: "CANCELLED"; message: string }
  | { status: "ERROR"; message: string };

const LOCAL_KEY = "istok_user_identity";

/**
 * Small helpers
 */
function safeString(v: any): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function buildNewIdentity(user: FirebaseUser): IStokUserIdentity {
  return {
    uid: user.uid,
    email: safeString(user.email),
    displayName: safeString(user.displayName),
    photoURL: safeString(user.photoURL),
    istokId: "",
    codename: "",
  };
}

async function loadProfileFromFirestore(uid: string): Promise<IStokUserIdentity | null> {
  if (!db) return null;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return snap.data() as IStokUserIdentity;
}

function saveLocal(identity: IStokUserIdentity) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(identity));
  } catch {
    // ignore storage issues
  }
}

function readLocal(): IStokUserIdentity | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IStokUserIdentity;
  } catch {
    return null;
  }
}

async function ensureAuthPersistence(mode: "local" | "session" = "local") {
  if (!auth) return;
  const persistence = mode === "session" ? browserSessionPersistence : browserLocalPersistence;
  try {
    await setPersistence(auth, persistence);
  } catch (error) {
    console.warn("[ISTOK_AUTH] Failed to set auth persistence.", error);
  }
}

/**
 * Normalize Firebase auth errors to friendly messages
 */
function normalizeAuthError(error: any): { code: string; message: string } {
  const code = safeString(error?.code);
  const msg = safeString(error?.message || error);

  // User cancels
  if (code === "auth/user-cancelled" || msg.includes("cancel")) {
    return { code, message: "Login cancelled by user." };
  }

  // Network issues
  if (code === "auth/network-request-failed") {
    return { code, message: "Network connection failed. Please check your internet." };
  }

  // Domain issues (mostly web)
  if (code === "auth/unauthorized-domain" || msg.includes("unauthorized-domain")) {
    const currentDomain = window.location.hostname;
    return {
      code,
      message: `Domain "${currentDomain}" unauthorized. Add it in Firebase Console > Auth > Settings.`,
    };
  }

  // Popup errors should not appear anymore, but keep safe fallback
  if (code.includes("popup") || msg.includes("popup")) {
    return {
      code,
      message: "Popup-based login is not supported on mobile. Please use redirect login.",
    };
  }

  return { code, message: msg || "Login failed." };
}

export const IstokIdentityService = {
  /**
   * Google login entrypoint for BOTH web & Capacitor.
   *
   * Behavior:
   * - If a redirect result exists (user just came back from browser), returns identity.
   * - Otherwise starts redirect flow and returns REDIRECT_STARTED.
   *
   * UI usage suggestion:
   * - If status === "REDIRECT_STARTED": do nothing (app will leave to browser).
   * - If status === "SIGNED_IN": proceed to app.
   */
  loginWithGoogle: async (): Promise<LoginOutcome> => {
    if (!auth) {
      // This matches your app's existing error text
      return { status: "ERROR", message: "Firebase Configuration Missing in .env" };
    }

    try {
      await ensureAuthPersistence("local");
      // 1) If user just returned from redirect flow, this will contain the result
      const redirectResult = await getRedirectResult(auth);

      if (redirectResult?.user) {
        const user = redirectResult.user;

        // Try firestore profile
        const existing = await loadProfileFromFirestore(user.uid);
        const identity = existing ?? buildNewIdentity(user);

        // Save local mirror for fast startup/offline use
        saveLocal(identity);

        return { status: "SIGNED_IN", identity };
      }

      // 2) No redirectResult => start redirect login
      await signInWithRedirect(auth, googleProvider);

      // At this point the app will navigate away to browser.
      return { status: "REDIRECT_STARTED" };
    } catch (error: any) {
      console.error("[ISTOK_AUTH] Detailed Error:", error);

      const { code, message } = normalizeAuthError(error);
      debugService.log("ERROR", "ISTOK_AUTH", "LOGIN_FAIL", `${code}: ${message}`);

      // Treat some known cases as cancellation
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        message.toLowerCase().includes("cancelled")
      ) {
        return { status: "CANCELLED", message: "Login cancelled by user." };
      }

      return { status: "ERROR", message };
    }
  },

  /**
   * Save initial profile (new user setup)
   */
  createProfile: async (identity: IStokUserIdentity) => {
    if (!db || !identity?.uid) return;

    try {
      await setDoc(doc(db, "users", identity.uid), {
        ...identity,
        createdAt: serverTimestamp(),
        lastIdChange: serverTimestamp(),
        idChangeCount: 0,
      });

      saveLocal(identity);
    } catch (e) {
      console.error("Profile Creation Error", e);
      throw e;
    }
  },

  /**
   * Update ID with restrictions (2x per 30 days)
   */
  updateCodename: async (
    uid: string,
    newCodename: string
  ): Promise<{ success: boolean; msg: string }> => {
    if (!db) return { success: false, msg: "Database offline" };
    if (!uid) return { success: false, msg: "Invalid user" };

    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return { success: false, msg: "User not found" };

    const data: any = userSnap.data();
    const now = new Date();
    const lastChange = data.lastIdChange?.toDate ? data.lastIdChange.toDate() : new Date(0);

    const daysSince = (now.getTime() - lastChange.getTime()) / (1000 * 3600 * 24);
    let count = data.idChangeCount || 0;

    // Reset quota if > 30 days
    if (daysSince > 30) count = 0;

    if (count >= 2) {
      return {
        success: false,
        msg: `Limit reached. You can change ID again in ${Math.ceil(30 - daysSince)} days.`,
      };
    }

    const clean = newCodename.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!clean) return { success: false, msg: "Invalid ID format" };

    const newId = `ISTOIC-${clean}`;

    try {
      await updateDoc(userRef, {
        codename: clean,
        istokId: newId,
        lastIdChange: serverTimestamp(),
        idChangeCount: count + 1,
      });

      const newIdentity = { ...data, codename: clean, istokId: newId };
      saveLocal(newIdentity);

      return { success: true, msg: "ID Updated Successfully." };
    } catch (e: any) {
      return { success: false, msg: safeString(e?.message || e) };
    }
  },

  /**
   * Logout
   */
  logout: async () => {
    if (auth) await fbSignOut(auth);
    try {
      localStorage.removeItem(LOCAL_KEY);
      localStorage.removeItem("bio_auth_enabled");
      // Do NOT remove sys_vault_hash to prevent lock-out from local data
    } catch {
      // ignore
    }
  },

  /**
   * Helpers
   */
  formatId: (rawName: string): string => {
    const clean = safeString(rawName).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return `ISTOIC-${clean}`;
  },

  resolveId: (input: string): string => {
    const cleanInput = safeString(input).trim().toUpperCase();
    if (cleanInput.startsWith("ISTOIC-")) return cleanInput;
    return `ISTOIC-${cleanInput}`;
  },

  /**
   * Optional: fast local read (offline UX)
   */
  getLocalIdentity: (): IStokUserIdentity | null => {
    return readLocal();
  },
};
