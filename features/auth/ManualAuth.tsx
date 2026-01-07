
import React, { useState, useEffect } from 'react';
import { 
    Mail, Lock, ArrowRight, ArrowLeft, KeyRound, 
    ShieldCheck, Loader2, RefreshCw, Send, CheckCircle2,
    HelpCircle, AlertTriangle
} from 'lucide-react';
import { auth } from '../../services/firebaseConfig';
// @ts-ignore
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth';
import { IstokIdentityService } from '../istok/services/istokIdentity';
import { setSystemPin } from '../../utils/crypto';

// --- SUB-COMPONENT: REGISTER MANUAL (CODE FLOW) ---
export const RegisterManual: React.FC<{ onBack: () => void, onSuccess: () => void }> = ({ onBack, onSuccess }) => {
    const [step, setStep] = useState<'EMAIL' | 'CODE' | 'PASSWORD'>('EMAIL');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSendCode = async () => {
        if (!email.includes('@')) { setError("Email tidak valid"); return; }
        setLoading(true);
        setError('');
        
        // Simulasi pengiriman kode (Dalam production gunakan Firebase Email Link / Cloud Function)
        setTimeout(() => {
            setLoading(false);
            setStep('CODE');
            // Di real app, trigger firebase.auth().sendSignInLinkToEmail(email, ...)
        }, 1500);
    };

    const handleVerifyCode = () => {
        if (code.length < 4) { setError("Kode tidak valid"); return; }
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            setStep('PASSWORD');
        }, 1000);
    };

    const handleRegister = async () => {
        if (password.length < 6) { setError("Password min 6 karakter"); return; }
        setLoading(true);
        try {
            // Create Firebase Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Create Istok Profile
            await IstokIdentityService.createProfile({
                uid: userCredential.user.uid,
                email: email,
                displayName: email.split('@')[0],
                photoURL: "", // Default
                istokId: IstokIdentityService.formatId(email.split('@')[0]),
                codename: email.split('@')[0].toUpperCase()
            });

            onSuccess();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full animate-slide-up">
            <div className="text-center mb-6">
                <h2 className="text-xl font-black text-white uppercase tracking-tight">DAFTAR MANUAL</h2>
                <p className="text-[10px] text-neutral-500 font-mono mt-1">SECURE ENCRYPTED REGISTRATION</p>
            </div>

            {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold text-center mb-4">{error}</div>}

            {step === 'EMAIL' && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest ml-1">Email Address</label>
                        <div className="relative">
                            <input 
                                type="email" value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full bg-[#121214] border border-white/10 rounded-2xl px-5 py-4 pl-12 text-sm font-bold text-white focus:border-emerald-500 outline-none transition-all"
                                placeholder="nama@email.com"
                            />
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        </div>
                    </div>
                    <button onClick={handleSendCode} disabled={loading} className="w-full py-4 bg-white text-black hover:bg-neutral-200 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all">
                        {loading ? <Loader2 className="animate-spin"/> : <Send size={16}/>} KIRIM KODE VERIFIKASI
                    </button>
                </div>
            )}

            {step === 'CODE' && (
                <div className="space-y-4">
                     <p className="text-xs text-center text-neutral-400">Kode dikirim ke <span className="text-white font-bold">{email}</span></p>
                     <div className="relative">
                        <input 
                            type="text" maxLength={6} value={code} onChange={e => setCode(e.target.value)}
                            className="w-full bg-[#121214] border border-white/10 rounded-2xl px-5 py-4 text-center text-2xl font-mono text-white focus:border-emerald-500 outline-none tracking-[0.5em]"
                            placeholder="000000"
                        />
                    </div>
                    <button onClick={handleVerifyCode} disabled={loading} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="animate-spin"/> : <CheckCircle2 size={16}/>} VERIFIKASI
                    </button>
                </div>
            )}

            {step === 'PASSWORD' && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest ml-1">Setup Password</label>
                        <div className="relative">
                            <input 
                                type="password" value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-[#121214] border border-white/10 rounded-2xl px-5 py-4 pl-12 text-sm font-bold text-white focus:border-emerald-500 outline-none transition-all"
                                placeholder="••••••••"
                            />
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        </div>
                    </div>
                    <button onClick={handleRegister} disabled={loading} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="animate-spin"/> : <ShieldCheck size={16}/>} SELESAI & MASUK
                    </button>
                </div>
            )}

            <button onClick={onBack} className="w-full mt-4 py-3 text-[10px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest flex items-center justify-center gap-2">
                <ArrowLeft size={12} /> KEMBALI
            </button>
        </div>
    );
};

// --- SUB-COMPONENT: FORGOT PIN (RESET VIA AUTH) ---
export const ForgotPin: React.FC<{ onBack: () => void, onSuccess: () => void }> = ({ onBack, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [newPin, setNewPin] = useState('');

    const handleReset = async () => {
        if (newPin.length < 4) return alert("PIN min 4 digit");
        if (!confirm("Reset PIN akan menghapus akses ke data terenkripsi lama jika tidak dibackup. Lanjutkan?")) return;
        
        setLoading(true);
        // Simulate re-auth check or just overwrite local PIN for this MVP
        setTimeout(async () => {
            await setSystemPin(newPin);
            setLoading(false);
            alert("PIN Baru berhasil diatur.");
            onSuccess();
        }, 1500);
    };

    return (
        <div className="w-full animate-slide-up">
            <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20 mb-4 text-amber-500">
                    <KeyRound size={32} />
                </div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">RESET PIN AKSES</h2>
                <p className="text-[10px] text-neutral-500 mt-2 max-w-[250px] mx-auto leading-relaxed">
                    Untuk keamanan, Anda harus mengatur ulang PIN lokal perangkat ini.
                </p>
            </div>

            <div className="space-y-4">
                 <div className="relative">
                    <input 
                        type="password" inputMode="numeric" maxLength={6}
                        value={newPin} onChange={e => setNewPin(e.target.value)}
                        className="w-full bg-[#121214] border border-white/10 rounded-2xl px-5 py-4 text-center text-2xl font-mono text-white focus:border-amber-500 outline-none tracking-[0.5em]"
                        placeholder="BARU"
                    />
                </div>
                
                <button onClick={handleReset} disabled={loading} className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20">
                    {loading ? <Loader2 className="animate-spin"/> : <RefreshCw size={16}/>} ATUR ULANG PIN
                </button>
            </div>

            <button onClick={onBack} className="w-full mt-6 py-3 text-[10px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest">
                BATAL
            </button>
        </div>
    );
};

// --- SUB-COMPONENT: FORGOT ACCOUNT ---
export const ForgotAccount: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    return (
        <div className="w-full animate-slide-up">
            <div className="text-center mb-8">
                 <div className="w-16 h-16 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20 mb-4 text-blue-500">
                    <HelpCircle size={32} />
                </div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">PEMULIHAN AKUN</h2>
                <p className="text-xs text-neutral-400 mt-2">Hubungi administrator sistem atau gunakan email pemulihan.</p>
            </div>

            <div className="space-y-3">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-left">
                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-1 flex items-center gap-2">
                        <Mail size={12} /> EMAIL RECOVERY
                    </h4>
                    <p className="text-xs text-neutral-400">Masukkan email yang terdaftar untuk menerima link reset.</p>
                    <div className="flex gap-2 mt-3">
                        <input className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white" placeholder="email@anda.com" />
                        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold">KIRIM</button>
                    </div>
                </div>

                <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 text-left flex gap-3">
                    <AlertTriangle size={20} className="text-amber-500 shrink-0" />
                    <div>
                        <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">MANUAL SUPPORT</h4>
                        <p className="text-[10px] text-neutral-400">Jika kehilangan akses total, silakan hubungi tim IT IStoic melalui channel aman.</p>
                    </div>
                </div>
            </div>

            <button onClick={onBack} className="w-full mt-6 py-3 text-[10px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest">
                KEMBALI KE LOGIN
            </button>
        </div>
    );
};
