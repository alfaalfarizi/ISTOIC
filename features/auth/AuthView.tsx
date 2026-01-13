import React, { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  Loader2,
  Fingerprint,
  Lock,
  ShieldAlert,
  ScanFace,
  Chrome,
  KeyRound,
  Mail,
  HelpCircle,
  Terminal,
} from "lucide-react";

import {
  verifySystemPin,
  verifyMasterPin,
  isSystemPinConfigured,
  setSystemPin,
} from "../../utils/crypto";

import { BiometricService } from "../../services/biometricService";
import useLocalStorage from "../../hooks/useLocalStorage";
import { IstokIdentityService, IStokUserIdentity } from "../istok/services/istokIdentity";
import { LoginManual, RegisterManual, ForgotAccount, ForgotPin } from "./ManualAuth";

import { auth, db, firebaseConfigError } from "../../services/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { authStyles } from "./authStyles";

interface AuthViewProps {
  onAuthSuccess: () => void;
}

type AuthStage =
  | "CHECKING"
  | "WELCOME"
  | "CREATE_ID"
  | "SETUP_PIN"
  | "LOCKED"
  | "BIOMETRIC_SCAN"
  | "LOGIN_MANUAL"
  | "REGISTER_MANUAL"
  | "FORGOT_PIN"
  | "FORGOT_ACCOUNT";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

const DEV_BYPASS_ENABLED = String(import.meta.env.VITE_ENABLE_DEV_BYPASS || "").toLowerCase() === "true";
const FIRESTORE_TIMEOUT_MS = 15000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs = FIRESTORE_TIMEOUT_MS): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timeout. Coba lagi.")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [identity, setIdentity] = useLocalStorage<IStokUserIdentity | null>("istok_user_identity", null);
  const [bioEnabled, setBioEnabled] = useLocalStorage<boolean>("bio_auth_enabled", false);

  const [pendingGoogleUser, setPendingGoogleUser] = useState<IStokUserIdentity | null>(null);

  const [failedAttempts, setFailedAttempts] = useLocalStorage<number>("auth_failed_count", 0);
  const [lockoutUntil, setLockoutUntil] = useLocalStorage<number>("auth_lockout_until", 0);

  const [stage, setStage] = useState<AuthStage>("CHECKING");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [bioStatus, setBioStatus] = useState("SCANNING...");

  const [codename, setCodename] = useState("");
  const [pinInput, setPinInput] = useState("");

  const [isHardLocked, setIsHardLocked] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 200);
  };

  const setNiceError = (msg: string) => {
    setError(msg);
    triggerShake();
  };

  useEffect(() => {
    const checkLockout = () => {
      const now = Date.now();
      if (lockoutUntil > now) {
        setIsHardLocked(true);
        setCountdown(Math.ceil((lockoutUntil - now) / 1000));
      } else {
        if (isHardLocked) {
          setIsHardLocked(false);
          setFailedAttempts(0);
          setLockoutUntil(0);
          setCountdown(0);
        }
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil, isHardLocked, setFailedAttempts, setLockoutUntil]);

  useEffect(() => {
    if (stage === "LOCKED" && !isHardLocked && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [stage, isHardLocked]);

  const handleBiometricScan = async () => {
    if (isHardLocked) return;

    setBioStatus("SCANNING FACE ID...");
    try {
      const success = await BiometricService.authenticate();
      if (success) {
        setBioStatus("AUTHORIZED");
        setFailedAttempts(0);
        setTimeout(onAuthSuccess, 500);
      } else {
        setBioStatus("FAILED");
        setTimeout(() => setStage("LOCKED"), 800);
      }
    } catch {
      setBioStatus("ERROR");
      setTimeout(() => setStage("LOCKED"), 800);
    }
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;

    const initFlow = async () => {
      setError(null);

      if (firebaseConfigError) {
        setStage("WELCOME");
        setNiceError(firebaseConfigError);
        return;
      }

      if (identity && identity.istokId) {
        if (isSystemPinConfigured()) {
          if (bioEnabled && !isHardLocked) {
            setStage("BIOMETRIC_SCAN");
            handleBiometricScan();
          } else {
            setStage("LOCKED");
          }
        } else {
          setStage("SETUP_PIN");
        }
        return;
      }

      const redirectIdentity = await IstokIdentityService.finalizeRedirectIfAny();
      if (redirectIdentity) {
        if (redirectIdentity.istokId) {
          setIdentity(redirectIdentity);

          if (isSystemPinConfigured()) {
            if (bioEnabled && !isHardLocked) {
              setStage("BIOMETRIC_SCAN");
              handleBiometricScan();
            } else {
              setStage("LOCKED");
            }
          } else {
            setStage("SETUP_PIN");
          }
          return;
        }

        setPendingGoogleUser(redirectIdentity);
        setStage("CREATE_ID");
        return;
      }

      if (auth && db) {
        unsub = onAuthStateChanged(auth, async (user) => {
          if (!user) {
            setStage("WELCOME");
            return;
          }

          try {
            const snap = await withTimeout(getDoc(doc(db, "users", user.uid)));
            if (snap.exists()) {
              const data = snap.data() as IStokUserIdentity;
              setIdentity(data);

              if (isSystemPinConfigured()) {
                if (bioEnabled && !isHardLocked) {
                  setStage("BIOMETRIC_SCAN");
                  handleBiometricScan();
                } else {
                  setStage("LOCKED");
                }
              } else {
                setStage("SETUP_PIN");
              }
            } else {
              const tmp: IStokUserIdentity = {
                uid: user.uid,
                email: user.email || "",
                displayName: user.displayName || (user.email ? user.email.split("@")[0] : "USER"),
                photoURL: user.photoURL || "",
                istokId: "",
                codename: "",
              };
              setPendingGoogleUser(tmp);
              setStage("CREATE_ID");
            }
          } catch (e) {
            console.error("Silent Restore Failed", e);
            setStage("WELCOME");
          }
        });
      } else {
        setStage("WELCOME");
      }
    };

    initFlow();
    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.istokId, bioEnabled, isHardLocked]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await IstokIdentityService.loginWithGoogle();

      if (res.status === "REDIRECT_STARTED") {
        return;
      }

      if (res.status === "SIGNED_IN") {
        const userProfile = res.identity;

        if (userProfile?.istokId) {
          setIdentity(userProfile);

          if (isSystemPinConfigured()) {
            if (bioEnabled && !isHardLocked) {
              setStage("BIOMETRIC_SCAN");
              handleBiometricScan();
            } else {
              setStage("LOCKED");
            }
          } else {
            setStage("SETUP_PIN");
          }
          return;
        }

        setPendingGoogleUser(userProfile);
        setStage("CREATE_ID");
        return;
      }

      if (res.status === "CANCELLED") {
        setNiceError(res.message || "Login cancelled.");
        return;
      }

      if (res.status === "ERROR") {
        setNiceError(res.message || "Login Failed");
        return;
      }

      setNiceError("Login Failed");
    } catch (err: any) {
      setNiceError(err?.message || "Login Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIdentity = async () => {
    setError(null);

    if (codename.trim().length < 3) {
      setNiceError("MINIMUM 3 CHARS");
      return;
    }

    const baseUser = pendingGoogleUser;
    if (!baseUser?.uid) {
      setNiceError("SESSION EXPIRED. PLEASE LOGIN AGAIN.");
      setStage("WELCOME");
      return;
    }

    const cleanCodename = codename.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const finalId = IstokIdentityService.formatId(cleanCodename);

    const newIdentity: IStokUserIdentity = {
      ...baseUser,
      codename: cleanCodename,
      istokId: finalId,
    };

    setLoading(true);
    try {
      await IstokIdentityService.createProfile(newIdentity);
      setIdentity(newIdentity);
      setPendingGoogleUser(null);
      setStage("SETUP_PIN");
    } catch (err: any) {
      setNiceError(err?.message || "Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPin = async () => {
    setError(null);

    if (pinInput.length < 4) {
      setNiceError("PIN MIN 4 DIGITS");
      return;
    }

    await setSystemPin(pinInput);

    try {
      const available = await BiometricService.isAvailable();
      if (available) {
        const ok = confirm("Aktifkan Face ID / Fingerprint untuk akses cepat?");
        if (ok) {
          const res = await BiometricService.register(identity?.codename || "User");
          if (res) setBioEnabled(true);
        }
      }
    } catch (e) {
      console.error(e);
    }

    onAuthSuccess();
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isHardLocked) return;

    setLoading(true);
    setError(null);

    await new Promise((r) => setTimeout(r, 600));

    if (DEV_BYPASS_ENABLED) {
      const isMaster = await verifyMasterPin(pinInput);
      if (isMaster) {
        const devIdentity: IStokUserIdentity = {
          uid: "DEV-ROOT-ACCESS",
          istokId: "ISTOIC-DEV",
          codename: "DEVELOPER",
          email: "dev@system.local",
          displayName: "SYSTEM ADMIN",
          photoURL: "https://ui-avatars.com/api/?name=Dev&background=10b981&color=fff",
        };

        if (!identity || !identity.istokId) setIdentity(devIdentity);

        setFailedAttempts(0);
        setLoading(false);
        onAuthSuccess();
        return;
      }
    }

    const isValid = await verifySystemPin(pinInput);
    if (isValid) {
      setFailedAttempts(0);
      setLoading(false);
      onAuthSuccess();
      return;
    }

    const newCount = failedAttempts + 1;
    setFailedAttempts(newCount);
    setPinInput("");
    triggerShake();

    if (newCount >= MAX_ATTEMPTS) {
      setLockoutUntil(Date.now() + LOCKOUT_DURATION_MS);
      setIsHardLocked(true);
      setNiceError(`SYSTEM LOCKED FOR ${LOCKOUT_DURATION_MS / 60000} MINS`);
    } else {
      setNiceError(`INVALID PASSCODE (${MAX_ATTEMPTS - newCount} attempts left)`);
    }

    setLoading(false);
  };

  if (stage === "CHECKING") {
    return (
      <div className="fixed inset-0 bg-[var(--bg-main)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--border-highlight)] border-t-[var(--accent-color)] rounded-full animate-[spin_0.2s_linear_infinite]"></div>
          <p className="text-[var(--text-muted)] text-[10px] font-black tracking-[0.3em]">
            RESTORING IDENTITY...
          </p>
        </div>
      </div>
    );
  }

  if (stage === "BIOMETRIC_SCAN") {
    return (
      <div className="fixed inset-0 z-[9999] bg-[var(--bg-main)] flex flex-col items-center justify-center animate-[fadeIn_0.2s_ease-out] text-[var(--text-main)]">
        <div className="relative mb-8 text-[var(--accent-color)]">
          <ScanFace size={64} strokeWidth={1} />
          <div className="absolute inset-0 border-4 border-[var(--border-highlight)] rounded-full animate-[spin_0.2s_linear_infinite] w-full h-full scale-150 border-t-[var(--accent-color)]"></div>
        </div>
        <h2 className="text-xl font-black tracking-widest uppercase">{bioStatus}</h2>
        <button
          onClick={() => setStage("LOCKED")}
          className="mt-8 text-[var(--text-muted)] text-xs font-mono hover:text-[var(--text-main)] transition-colors duration-200 ease-out"
        >
          USE PIN
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--bg-main)] flex items-center justify-center p-6 overflow-hidden font-sans select-none">
      <div className="absolute inset-0 bg-[var(--bg-surface)]/70 shadow-[inset_0_1px_0_rgba(var(--shadow-color),0.08)] pointer-events-none"></div>

      <div className={`relative w-full max-w-sm ${shake ? "animate-[shake_0.2s_cubic-bezier(.36,.07,.19,.97)_both]" : ""}`}>
        <div className={authStyles.card}>
          {stage === "WELCOME" && (
            <div className="text-center space-y-8 animate-[slideUp_0.2s_ease-out]">
              <div className="space-y-2">
                <h1 className="text-3xl font-black text-[var(--text-main)] italic tracking-tighter uppercase">
                  ISTOIC <span className="text-[var(--accent-color)]">TITANIUM</span>
                </h1>
                <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-[0.3em]">
                  SECURE COGNITIVE OS v101.0
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-4 bg-[var(--accent-color)] text-[var(--on-accent-color)] hover:brightness-110 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 transition-all duration-200 ease-out active:scale-95 group"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-[spin_0.2s_linear_infinite]" />
                  ) : (
                    <Chrome size={18} className="text-[var(--on-accent-color)]" />
                  )}
                  LANJUTKAN DENGAN GOOGLE
                </button>

                <div className="flex items-center gap-4 px-2">
                  <div className="h-[1px] bg-[var(--border-base)] flex-1"></div>
                  <span className="text-[9px] text-[var(--text-muted)] font-black uppercase">ATAU</span>
                  <div className="h-[1px] bg-[var(--border-base)] flex-1"></div>
                </div>

                <button
                  onClick={() => setStage("LOGIN_MANUAL")}
                  disabled={loading}
                  className="w-full py-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-base)] text-[var(--text-main)] rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 transition-all duration-200 ease-out active:scale-95"
                >
                  <Mail size={18} className="text-[var(--accent-color)]" />
                  LOGIN DENGAN EMAIL
                </button>

                <button
                  onClick={() => setStage("REGISTER_MANUAL")}
                  disabled={loading}
                  className="w-full py-3 bg-[color:rgb(var(--accent-rgb)/0.12)] hover:bg-[color:rgb(var(--accent-rgb)/0.2)] border border-[color:rgb(var(--accent-rgb)/0.3)] text-[var(--accent-color)] rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 transition-all duration-200 ease-out active:scale-95"
                >
                  BUAT AKUN BARU
                </button>

                <button
                  onClick={() => setStage("FORGOT_ACCOUNT")}
                  className="text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors duration-200 ease-out flex items-center gap-2 mx-auto pt-2"
                >
                  <HelpCircle size={10} /> LUPA AKUN?
                </button>
              </div>

              <div className="space-y-4 pt-2">
                {isSystemPinConfigured() && (
                  <button
                    onClick={() => setStage("LOCKED")}
                    className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors duration-200 ease-out flex items-center justify-center gap-2 mx-auto"
                  >
                    <KeyRound size={12} /> AKSES PERANGKAT
                  </button>
                )}
              </div>

              {error && (
                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-highlight)] rounded-xl text-[var(--accent-color)] text-xs font-medium mt-4">
                  {error}
                </div>
              )}
            </div>
          )}

          {stage === "CREATE_ID" && (
            <div className="space-y-6 animate-[slideUp_0.2s_ease-out]">
              <div className="text-center">
                <h2 className={authStyles.title}>Setup Identitas</h2>
                <p className="text-xs text-[var(--text-muted)] mt-2">Buat Callsign unik untuk jaringan IStok.</p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-base)] rounded-2xl px-4 py-4 focus-within:border-[var(--accent-color)] transition-all duration-200 ease-out flex items-center">
                <span className="text-[var(--accent-color)] font-black text-sm mr-1 select-none">ISTOIC-</span>
                <input
                  value={codename}
                  onChange={(e) => setCodename(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                  className="bg-transparent border-none outline-none text-[var(--text-main)] font-bold text-lg w-full uppercase"
                  placeholder="BARISTA"
                  maxLength={12}
                />
              </div>

              {error && <div className="text-[var(--accent-color)] text-[10px] text-center font-bold">{error}</div>}

              <button
                onClick={handleCreateIdentity}
                disabled={loading}
                className="w-full py-4 bg-[var(--accent-color)] text-[var(--on-accent-color)] rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all duration-200 ease-out hover:brightness-110"
              >
                {loading ? <Loader2 className="animate-[spin_0.2s_linear_infinite]" /> : <ArrowRight />} SIMPAN & LANJUT
              </button>
            </div>
          )}

          {stage === "SETUP_PIN" && (
            <div className="space-y-6 animate-[slideUp_0.2s_ease-out] text-center">
              <div className="w-16 h-16 bg-[var(--bg-surface)] text-[var(--accent-color)] rounded-full flex items-center justify-center mx-auto border border-[var(--border-highlight)] mb-4">
                <KeyRound size={28} />
              </div>
              <h2 className={authStyles.title}>Kunci Perangkat</h2>
              <p className="text-xs text-[var(--text-muted)]">
                PIN ini hanya tersimpan di perangkat ini untuk enkripsi lokal. Login berikutnya HANYA menggunakan PIN ini.
              </p>

              <input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.slice(0, 6))}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-base)] rounded-2xl py-5 text-center text-3xl font-black text-[var(--text-main)] tracking-[0.5em] focus:border-[var(--accent-color)] outline-none transition-all duration-200 ease-out"
                placeholder="••••"
              />

              {error && <p className="text-[var(--accent-color)] text-[10px] font-bold">{error}</p>}

              <button
                onClick={handleSetupPin}
                className="w-full py-4 bg-[var(--accent-color)] text-[var(--on-accent-color)] rounded-2xl font-black uppercase text-xs tracking-widest transition-all duration-200 ease-out hover:brightness-110"
              >
                SET PASSCODE
              </button>
            </div>
          )}

          {stage === "LOCKED" && (
            <form onSubmit={handleUnlock} className="space-y-6 animate-[slideUp_0.2s_ease-out]">
              <div className="text-center space-y-2 mb-8">
                <div
                  className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-4 transition-all duration-200 ease-out ${
                    isHardLocked
                      ? "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-base)]"
                      : "bg-[var(--bg-surface)] text-[var(--accent-color)] shadow-[0_10px_30px_-18px_rgba(var(--shadow-color),0.2)]"
                  }`}
                >
                  {isHardLocked ? <Lock size={32} /> : identity ? <Fingerprint size={32} /> : <Terminal size={32} />}
                </div>
                <h2 className="text-xl font-bold text-[var(--text-main)] uppercase tracking-tight">
                  {identity?.displayName || "SYSTEM LOCKED"}
                </h2>
                <p className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">
                  {identity?.istokId || "AUTH_REQUIRED"}
                </p>
              </div>

              <div className="space-y-4">
                {isHardLocked ? (
                  <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-highlight)] rounded-2xl text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ShieldAlert size={24} className="text-[var(--accent-color)]" />
                      <p className="text-[10px] font-black text-[var(--accent-color)] uppercase tracking-widest">
                        SECURITY LOCKOUT
                      </p>
                    </div>
                    <p className="text-2xl font-mono text-[var(--text-main)] font-bold mt-2">
                      00:{Math.floor(countdown / 60)
                        .toString()
                        .padStart(2, "0")}
                      :{Math.floor(countdown % 60)
                        .toString()
                        .padStart(2, "0")}
                    </p>
                  </div>
                ) : (
                  <input
                    ref={inputRef}
                    type="password"
                    inputMode="numeric"
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value.slice(0, 6));
                      setError(null);
                    }}
                    className={`w-full bg-[var(--bg-surface)] border rounded-2xl py-5 text-center text-3xl font-black text-[var(--text-main)] tracking-[0.5em] focus:outline-none transition-all duration-200 ease-out placeholder:text-[var(--text-muted)] ${
                      error ? "border-[var(--accent-color)]" : "border-[var(--border-base)] focus:border-[var(--accent-color)]"
                    }`}
                    placeholder="••••••"
                    disabled={loading}
                    autoComplete="off"
                  />
                )}

                {error && !isHardLocked && (
                  <p className="text-center text-[10px] text-[var(--accent-color)] font-bold tracking-widest">{error}</p>
                )}
              </div>

              {!isHardLocked && (
                <div className="space-y-4">
                  <button
                    type="submit"
                    disabled={loading || pinInput.length < 4}
                    className="w-full py-4 bg-[var(--accent-color)] text-[var(--on-accent-color)] hover:brightness-110 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 transition-all duration-200 ease-out active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-[spin_0.2s_linear_infinite]" /> : <ArrowRight />} BUKA
                  </button>

                  {bioEnabled && (
                    <button
                      type="button"
                      onClick={handleBiometricScan}
                      className="w-full py-3 bg-[color:rgb(var(--accent-rgb)/0.12)] hover:bg-[color:rgb(var(--accent-rgb)/0.2)] text-[var(--accent-color)] rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all duration-200 ease-out active:scale-95 border border-[color:rgb(var(--accent-rgb)/0.3)]"
                    >
                      <ScanFace size={16} /> RETRY FACE ID
                    </button>
                  )}

                  <div className="flex justify-between items-center px-1">
                    <button
                      type="button"
                      onClick={() => setStage("FORGOT_PIN")}
                      className="text-[var(--text-muted)] text-[10px] font-bold tracking-widest hover:text-[var(--text-main)] transition-colors duration-200 ease-out"
                    >
                      LUPA PIN?
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage("WELCOME")}
                      className="text-[var(--text-muted)] text-[10px] font-bold tracking-widest hover:text-[var(--text-main)] transition-colors duration-200 ease-out"
                    >
                      GANTI AKUN
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {stage === "LOGIN_MANUAL" && (
            <LoginManual
              onBack={() => setStage("WELCOME")}
              onForgot={() => setStage("FORGOT_ACCOUNT")}
              onSuccess={(newIdentity) => {
                setIdentity(newIdentity);
                setStage(isSystemPinConfigured() ? "LOCKED" : "SETUP_PIN");
              }}
            />
          )}

          {stage === "REGISTER_MANUAL" && (
            <RegisterManual
              onBack={() => setStage("WELCOME")}
              onSuccess={(newIdentity) => {
                setIdentity(newIdentity);
                setStage("SETUP_PIN");
              }}
            />
          )}

          {stage === "FORGOT_PIN" && (
            <ForgotPin
              onBack={() => setStage("LOCKED")}
              expectedEmail={identity?.email}
              onSuccess={() => {
                setPinInput("");
                setStage("LOCKED");
              }}
            />
          )}

          {stage === "FORGOT_ACCOUNT" && <ForgotAccount onBack={() => setStage("WELCOME")} />}
        </div>
      </div>
    </div>
  );
};
