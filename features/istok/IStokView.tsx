import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    encryptData, decryptData
} from '../../utils/crypto'; 
import { TeleponanView } from '../teleponan/TeleponanView';
import { activatePrivacyShield } from '../../utils/privacyShield';
import { 
    Send, Zap, ScanLine, Server,
    Mic, Menu, PhoneCall, 
    QrCode, Lock, Flame, 
    ShieldAlert, ArrowLeft, BrainCircuit, Sparkles,
    Wifi, WifiOff, Paperclip, Camera, Globe, Languages, Check, X,
    Download, Share as ShareIcon, PlusSquare, Loader2
} from 'lucide-react';

// --- HOOKS & SERVICES ---
import useLocalStorage from '../../hooks/useLocalStorage';
import { OMNI_KERNEL } from '../../services/omniRace'; 
import { SidebarIStokContact, IStokSession, IStokProfile } from './components/SidebarIStokContact';
import { ShareConnection } from './components/ShareConnection'; 
import { ConnectionNotification } from './components/ConnectionNotification';
import { CallNotification } from './components/CallNotification';
import { MessageBubble } from './components/MessageBubble'; 
import { QRScanner } from './components/QRScanner'; 
import { compressImage } from './components/gambar';
import { AudioMessagePlayer } from './components/vn';

// --- CONSTANTS ---
const CHUNK_SIZE = 16384; 
const HEARTBEAT_MS = 3000; // Agresif: Ping tiap 3 detik agar tidak putus
const CONN_TIMEOUT = 10000; // 10 Detik timeout

// Daftar Bahasa Professional
const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English (Pro)', icon: '🇺🇸' },
    { code: 'id', name: 'Indonesia (Formal)', icon: '🇮🇩' },
    { code: 'jp', name: 'Japanese (Keigo)', icon: '🇯🇵' },
    { code: 'cn', name: 'Mandarin (Biz)', icon: '🇨🇳' },
    { code: 'ru', name: 'Russian', icon: '🇷🇺' },
    { code: 'ar', name: 'Arabic (MSA)', icon: '🇸🇦' },
    { code: 'de', name: 'German', icon: '🇩🇪' },
    { code: 'fr', name: 'French', icon: '🇫🇷' },
];

// --- TYPES ---
interface Message {
    id: string;
    sender: 'ME' | 'THEM';
    type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'FILE';
    content: string; 
    timestamp: number;
    status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
    duration?: number;
    size?: number;
    fileName?: string; 
    isMasked?: boolean;
    mimeType?: string;
    ttl?: number; 
    isTranslated?: boolean;
    originalLang?: string; 
}

type AppMode = 'SELECT' | 'HOST' | 'JOIN' | 'CHAT';
type ConnectionStage = 'IDLE' | 'FETCHING_RELAYS' | 'INITIALIZING_AGENT' | 'LOCATING_PEER' | 'VERIFYING_KEYS' | 'ESTABLISHING_TUNNEL' | 'AWAITING_APPROVAL' | 'SECURE' | 'RECONNECTING';

// --- UTILS ---
const generateAnomalyIdentity = () => `ANOMALY-${Math.floor(Math.random() * 9000) + 1000}`;
const generateStableId = () => `ISTOK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

const triggerHaptic = (ms: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
};

const playSound = (type: 'MSG_IN' | 'MSG_OUT' | 'CONNECT' | 'CALL_RING' | 'BUZZ' | 'AI_THINK' | 'TRANSLATE') => {
    try {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        
        const presets: any = {
            'MSG_IN': { freq: 800, type: 'sine', dur: 0.1 },
            'MSG_OUT': { freq: 400, type: 'sine', dur: 0.05 },
            'CONNECT': { freq: 600, type: 'sine', dur: 0.2 },
            'TRANSLATE': { freq: 400, type: 'square', dur: 0.15 },
            'CALL_RING': { freq: 880, type: 'triangle', dur: 0.5 },
            'BUZZ': { freq: 150, type: 'sawtooth', dur: 0.3 },
            'AI_THINK': { freq: 1200, type: 'sine', dur: 0.1 },
        };

        const p = presets[type];
        if (p) {
            osc.type = p.type;
            osc.frequency.setValueAtTime(p.freq, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + p.dur);
            osc.start(now); osc.stop(now + p.dur);
        }
    } catch(e) {}
};

// AGGRESSIVE ICE FETCHING (WALL BREAKER)
const getIceServers = async (): Promise<any[]> => {
    const publicIce = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ];

    const apiKey = import.meta.env.VITE_METERED_API_KEY;
    if (!apiKey) {
        console.warn("[ISTOK_NET] ⚠️ No TURN Key found. Using Public STUN (May fail on 4G).");
        return publicIce;
    }

    try {
        console.log("[ISTOK_NET] 🚀 Fetching Premium TURN Servers...");
        // Timeout 3 detik agar tidak bengong kalau Metered down
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`https://istoic.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error("Metered Auth Failed");
        
        const turnServers = await response.json();
        console.log("[ISTOK_NET] ✅ TURN Servers Active (Wall Breaker Ready)");
        return [...turnServers, ...publicIce];
    } catch (e) {
        console.error("[ISTOK_NET] ❌ TURN Fetch Failed, falling back to STUN:", e);
        return publicIce;
    }
};

// --- SUB-COMPONENTS ---

const PWAInstallPrompt = () => {
    const [supportsPWA, setSupportsPWA] = useState(false);
    const [promptInstall, setPromptInstall] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSHint, setShowIOSHint] = useState(false);

    useEffect(() => {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(ios);
        const handler = (e: any) => { e.preventDefault(); setPromptInstall(e); setSupportsPWA(true); };
        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    const handleInstall = (e: React.MouseEvent) => {
        e.preventDefault();
        if (isIOS) setShowIOSHint(true);
        else if (promptInstall) promptInstall.prompt();
    };

    if (!supportsPWA && !isIOS) return null;

    return (
        <>
            {supportsPWA && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[50] animate-slide-down">
                    <button onClick={handleInstall} className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-[10px] font-bold text-white shadow-lg hover:bg-white/20 transition-all">
                        <Download size={12} /> INSTALL APP
                    </button>
                </div>
            )}
            {showIOSHint && (
                <div className="fixed inset-0 z-[100001] bg-black/90 backdrop-blur flex flex-col justify-end pb-safe-bottom" onClick={() => setShowIOSHint(false)}>
                    <div className="bg-[#1c1c1e] rounded-t-3xl p-6 pb-12 animate-slide-up border-t border-white/10">
                        <h3 className="text-white font-bold text-lg mb-4">Install to iPhone</h3>
                        <div className="space-y-4 text-sm text-neutral-300">
                            <div className="flex items-center gap-4"><ShareIcon size={24} className="text-blue-500" /><p>1. Tap <span className="text-white font-bold">Share</span></p></div>
                            <div className="flex items-center gap-4"><PlusSquare size={24} className="text-white" /><p>2. Tap <span className="text-white font-bold">Add to Home Screen</span></p></div>
                        </div>
                        <div className="mt-6 w-12 h-1 bg-white/20 rounded-full mx-auto"></div>
                    </div>
                </div>
            )}
        </>
    );
};

const IStokInput = React.memo(({ onSend, onTyping, disabled, isRecording, recordingTime, isVoiceMasked, onToggleMask, onStartRecord, onStopRecord, onAttach, ttlMode, onToggleTtl, onAiAssist, isAiThinking, translateTarget, setTranslateTarget }: any) => {
    const [text, setText] = useState('');
    const [showLangMenu, setShowLangMenu] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const insertText = (newText: string) => setText(newText);

    return (
        <div className="bg-[#09090b]/95 backdrop-blur border-t border-white/10 p-3 z-20 pb-[calc(env(safe-area-inset-bottom)+1rem)] relative shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            {showLangMenu && (
                <div className="lang-menu absolute bottom-full left-4 mb-2 bg-[#121214] border border-white/10 rounded-xl p-2 shadow-2xl w-48 animate-slide-up z-50">
                    <div className="text-[9px] font-bold text-neutral-500 mb-2 px-2 uppercase tracking-widest border-b border-white/5 pb-1">AI CORE TRANSLATE</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scroll">
                        <button onClick={() => { setTranslateTarget(null); setShowLangMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-bold transition-all ${!translateTarget ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:bg-white/5'}`}><X size={12} /> OFF (Original)</button>
                        {SUPPORTED_LANGUAGES.map(lang => (
                            <button key={lang.code} onClick={() => { setTranslateTarget(lang); setShowLangMenu(false); }} className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold transition-all ${translateTarget?.code === lang.code ? 'bg-blue-600 text-white' : 'text-neutral-300 hover:bg-white/5'}`}><span className="flex items-center gap-2">{lang.icon} {lang.name}</span>{translateTarget?.code === lang.code && <Check size={12}/>}</button>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex items-center justify-between mb-2 px-1">
                 <div className="flex gap-2">
                     <button onClick={onToggleTtl} className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider transition-all ${ttlMode > 0 ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-white/5 border-white/5 text-neutral-500'}`}><Flame size={10} className={ttlMode > 0 ? 'fill-current' : ''} />{ttlMode > 0 ? `${ttlMode}s` : 'OFF'}</button>
                     <button onClick={() => onAiAssist(text, insertText)} disabled={isAiThinking} className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider transition-all ${isAiThinking ? 'bg-purple-500/20 border-purple-500 text-purple-400 animate-pulse' : 'bg-white/5 border-white/5 text-neutral-500 hover:text-purple-400'}`}>{isAiThinking ? <Sparkles size={10} className="animate-spin" /> : <BrainCircuit size={10} />}{isAiThinking ? 'RACING...' : 'AI DRAFT'}</button>
                     <button onClick={() => setShowLangMenu(!showLangMenu)} className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider transition-all ${translateTarget ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-white/5 border-white/5 text-neutral-500'}`}><Globe size={10} />{translateTarget ? translateTarget.code.toUpperCase() : 'LANG'}</button>
                 </div>
                 <span className="text-[8px] font-mono text-emerald-500/50 flex items-center gap-1"><Lock size={8}/> E2EE</span>
            </div>
            <div className="flex gap-2 items-end">
                <button onClick={onAttach} className="p-3 bg-white/5 rounded-full text-neutral-400 hover:text-white transition-colors"><Paperclip size={20}/></button>
                <div className={`flex-1 bg-white/5 rounded-2xl px-4 py-3 border focus-within:border-emerald-500/30 transition-colors relative ${translateTarget ? 'border-blue-500/30' : 'border-white/5'}`}>
                    <input ref={inputRef} value={text} onChange={e=>{setText(e.target.value); onTyping();}} onKeyDown={e=>e.key==='Enter'&&text.trim()&&(onSend(text),setText(''))} placeholder={isRecording ? "Recording..." : (translateTarget ? `Translating to ${translateTarget.name}...` : "Message...")} className="w-full bg-transparent outline-none text-white text-sm placeholder:text-neutral-600" disabled={disabled||isRecording || isAiThinking}/>
                </div>
                {text.trim() ? (
                    <button onClick={()=>{onSend(text); setText('');}} disabled={isAiThinking} className={`p-3 rounded-full text-white shadow-lg transition-all active:scale-95 ${isAiThinking ? 'bg-neutral-700' : (translateTarget ? 'bg-blue-600' : 'bg-emerald-600')}`}>{isAiThinking ? <Loader2 size={20} className="animate-spin"/> : <Send size={20}/>}</button>
                ) : (
                    <button onMouseDown={onStartRecord} onMouseUp={onStopRecord} onTouchStart={onStartRecord} onTouchEnd={onStopRecord} className={`p-3 rounded-full transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-neutral-400'}`}><Mic size={20}/></button>
                )}
            </div>
        </div>
    );
});

// --- MAIN COMPONENT ---

export const IStokView: React.FC = () => {
    const [mode, setMode] = useState<AppMode>('SELECT');
    const [stage, setStage] = useState<ConnectionStage>('IDLE');
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [myProfile] = useLocalStorage<IStokProfile>('istok_profile_v1', { id: generateStableId(), username: generateAnomalyIdentity(), created: Date.now() });
    const [sessions, setSessions] = useLocalStorage<IStokSession[]>('istok_sessions', []);
    
    const [targetPeerId, setTargetPeerId] = useState<string>('');
    const [accessPin, setAccessPin] = useState<string>('');
    const [pendingJoin, setPendingJoin] = useState<{id:string, pin:string} | null>(null);
    
    const [showSidebar, setShowSidebar] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [showCall, setShowCall] = useState(false);
    const [viewImage, setViewImage] = useState<string|null>(null);
    const [showScanner, setShowScanner] = useState(false);
    
    const [messages, setMessages] = useState<Message[]>([]);
    const [isPeerOnline, setIsPeerOnline] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isVoiceMasked, setIsVoiceMasked] = useState(false);
    const [ttlMode, setTtlMode] = useState(0); 
    const [isAiThinking, setIsAiThinking] = useState(false); 
    const [translateTarget, setTranslateTarget] = useState<any>(null);

    const [incomingRequest, setIncomingRequest] = useState<any>(null);
    const [incomingCall, setIncomingCall] = useState<any>(null);

    const peerRef = useRef<any>(null);
    const connRef = useRef<any>(null);
    const pinRef = useRef(accessPin);
    const msgEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chunkBuffer = useRef<any>({});
    const heartbeatRef = useRef<any>(null);
    const mediaRecorderRef = useRef<MediaRecorder|null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<any>(null);

    useEffect(() => { pinRef.current = accessPin; }, [accessPin]);
    useEffect(() => { msgEndRef.current?.scrollIntoView({behavior:'smooth'}); }, [messages]);

    // INIT
    useEffect(() => {
        activatePrivacyShield();
        document.body.style.overscrollBehavior = 'none';
        
        // AUTO DEEP LINK
        try {
            const url = new URL(window.location.href);
            const connect = url.searchParams.get('connect');
            const key = url.searchParams.get('key');
            if (connect && key) {
                setTargetPeerId(connect);
                setAccessPin(key);
                setMode('JOIN');
                setPendingJoin({ id: connect, pin: key });
                window.history.replaceState({}, '', window.location.pathname);
            }
        } catch(e) {}

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (peerRef.current && peerRef.current.disconnected) {
                    console.log("[ISTOK_NET] App foreground, reconnecting peer...");
                    peerRef.current.reconnect();
                }
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, []);

    // HEARTBEAT
    const startHeartbeat = useCallback(() => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
            if (!connRef.current?.open) {
                setIsPeerOnline(false);
            } else {
                connRef.current.send({ type: 'PING' });
                setIsPeerOnline(true);
            }
        }, HEARTBEAT_MS);
    }, []);

    const handleDisconnect = useCallback(() => {
        setIsPeerOnline(false);
        setStage('RECONNECTING');
        // Auto retry logic could go here
    }, []);

    const handleData = useCallback(async (data: any, incomingConn?: any) => {
        if (data.type === 'CHUNK') {
            const { id, idx, total, chunk } = data;
            if(!chunkBuffer.current[id]) chunkBuffer.current[id] = { chunks: new Array(total), count:0, total };
            const buf = chunkBuffer.current[id];
            if(!buf.chunks[idx]) { buf.chunks[idx] = chunk; buf.count++; }
            if(buf.count === total) {
                const full = buf.chunks.join('');
                delete chunkBuffer.current[id];
                handleData({type:'MSG', payload: full}, incomingConn);
            }
            return;
        }

        // --- INSTANT NOTIFICATION TRIGGER ---
        // Jika request koneksi masuk, langsung tampilkan notifikasi tanpa delay enkripsi
        if (data.type === 'REQ_PRE_CHECK') {
             playSound('MSG_IN'); // Pre-alert
             return;
        }

        const currentPin = pinRef.current;

        if (data.type === 'REQ') {
            const json = await decryptData(data.payload, currentPin);
            if (json) {
                const req = JSON.parse(json);
                if (req.type === 'CONNECTION_REQUEST') {
                    playSound('MSG_IN');
                    // Force state update immediately
                    setIncomingRequest({ peerId: incomingConn.peer, identity: req.identity, conn: incomingConn });
                }
            }
        }
        else if (data.type === 'RESP') {
            const json = await decryptData(data.payload, currentPin);
            if (json) {
                const res = JSON.parse(json);
                if (res.type === 'CONNECTION_ACCEPT') {
                    setStage('SECURE');
                    setMode('CHAT');
                    setIsPeerOnline(true);
                    startHeartbeat();
                    playSound('CONNECT');
                    setSessions(prev => {
                        const exists = prev.find(s => s.id === connRef.current.peer);
                        const newSess: IStokSession = {
                            id: connRef.current.peer,
                            name: res.identity,
                            lastSeen: Date.now(),
                            status: 'ONLINE',
                            pin: currentPin,
                            createdAt: Date.now()
                        };
                        if (exists) return prev.map(s => s.id === newSess.id ? newSess : s);
                        return [...prev, newSess];
                    });
                }
            }
        }
        else if (data.type === 'MSG') {
            const json = await decryptData(data.payload, currentPin);
            if (json) {
                const msg = JSON.parse(json);
                setMessages(p => {
                    const newH = [...p, { ...msg, sender: 'THEM', status: 'READ' }];
                    return newH.length > 100 ? newH.slice(newH.length - 100) : newH;
                });
                playSound('MSG_IN');
            }
        }
        else if (data.type === 'SIGNAL' && data.action === 'BUZZ') { triggerHaptic([100,50,100]); playSound('BUZZ'); }
        else if (data.type === 'PING') { /* Keep Alive */ }
    }, [startHeartbeat, setSessions]);

    // --- AGGRESSIVE INIT ---
    useEffect(() => {
        let mounted = true;
        if (peerRef.current) return;

        const init = async () => {
            try {
                setStage('FETCHING_RELAYS');
                // 1. Fetch ICE Server first (Blocking)
                const iceServers = await getIceServers();
                
                const { Peer } = await import('peerjs');
                if (!mounted) return;

                setStage('INITIALIZING_AGENT');
                const peer = new Peer(myProfile.id, {
                    debug: 1,
                    secure: true,
                    config: { 
                        iceServers, 
                        sdpSemantics: 'unified-plan',
                        iceTransportPolicy: 'all' // Force TURN usage if needed
                    },
                    retry_timer: 1000
                });

                peer.on('open', () => {
                    console.log("[ISTOK_NET] Peer Ready (Wall Breaker On):", myProfile.id);
                    setStage('IDLE');
                    
                    if (pendingJoin) {
                        setTimeout(() => joinSession(pendingJoin.id, pendingJoin.pin), 500);
                        setPendingJoin(null);
                    }
                });

                peer.on('connection', c => {
                    c.on('data', d => handleData(d, c));
                    c.on('close', handleDisconnect);
                    c.on('error', (e) => console.error("Conn Error", e));
                });

                peer.on('call', call => {
                    if (showCall) { call.close(); return; }
                    setIncomingCall(call);
                    playSound('CALL_RING');
                });

                peer.on('error', err => {
                    console.warn("Peer Error:", err);
                    if (err.type === 'peer-unavailable') { 
                        setErrorMsg("Target Offline / Blocked"); 
                        setStage('IDLE'); 
                    }
                    else if (err.type === 'disconnected') { 
                        peer.reconnect(); 
                    }
                    else if (err.type === 'network') {
                        setErrorMsg("Network Fail - Check 4G/WiFi");
                    }
                });

                peerRef.current = peer;
            } catch (e) {
                console.error("Critical Init Fail", e);
                setErrorMsg("Init Failed. Refresh App.");
            }
        };
        init();
        return () => { 
            mounted = false; 
            if(peerRef.current) peerRef.current.destroy(); 
            clearInterval(heartbeatRef.current);
        };
    }, []);

    // --- CONNECTION LOGIC ---

    const joinSession = (id?: string, pin?: string) => {
        const target = id || targetPeerId;
        const key = pin || accessPin;
        
        setMode('JOIN'); 
        setTargetPeerId(target);
        setAccessPin(key);

        if (!target || !key) return;

        if (!peerRef.current || peerRef.current.disconnected) {
            console.log("Peer Disconnected, reconnecting...");
            peerRef.current?.reconnect();
            setPendingJoin({id: target, pin: key});
            return;
        }

        setStage('LOCATING_PEER');
        if(connRef.current) connRef.current.close();

        // RELIABLE MODE ON
        const conn = peerRef.current.connect(target, { 
            reliable: true,
            serialization: 'json'
        });
        
        // Timeout Safety
        const connTimeout = setTimeout(() => {
            if (!conn.open) {
                conn.close();
                setErrorMsg("Connection Timeout. Retrying...");
                // Auto Retry once
                setTimeout(() => joinSession(target, key), 2000);
            }
        }, CONN_TIMEOUT);

        conn.on('open', async () => {
            clearTimeout(connTimeout);
            setStage('VERIFYING_KEYS');
            connRef.current = conn;
            
            // Send Pre-Check (Unencrypted) to wake up UI
            conn.send({ type: 'REQ_PRE_CHECK' });

            const payload = JSON.stringify({ type: 'CONNECTION_REQUEST', identity: myProfile.username });
            const encrypted = await encryptData(payload, key);
            
            if (encrypted) {
                conn.send({ type: 'REQ', payload: encrypted });
                setStage('AWAITING_APPROVAL');
            } else {
                conn.close();
                setErrorMsg("Encryption Gen Failed");
            }
        });

        conn.on('data', (d: any) => handleData(d, conn));
        conn.on('close', handleDisconnect);
        conn.on('error', (e: any) => { 
            clearTimeout(connTimeout);
            setStage('IDLE'); 
            setErrorMsg("Conn Error: " + e.message); 
        });
    };

    const handleQRScan = (data: string) => {
        setShowScanner(false);
        playSound('CONNECT');
        let tId = data, tPin = '';
        try {
            const url = new URL(data);
            const c = url.searchParams.get('connect');
            const k = url.searchParams.get('key');
            if (c && k) { tId = c; tPin = k; }
        } catch(e) {}
        try {
           const p = JSON.parse(data);
           if(p.id && p.pin) { tId = p.id; tPin = p.pin; }
        } catch(e) {}

        if(tId) {
            setTargetPeerId(tId);
            setAccessPin(tPin);
            joinSession(tId, tPin);
        }
    };

    // --- AI TRANSLATE ---
    const performNeuralTranslation = async (text: string, langName: string): Promise<string> => {
        if (!text) return text;
        try {
            if (OMNI_KERNEL && OMNI_KERNEL.raceStream) {
                const prompt = `Translate to ${langName}. Professional/Native tone. Text: "${text}"`;
                const stream = OMNI_KERNEL.raceStream(prompt, "Translator");
                let fullTranslation = '';
                for await (const chunk of stream) {
                    if (chunk.text) fullTranslation += chunk.text;
                }
                return fullTranslation.trim() || text;
            }
            return text;
        } catch (e) { return text; }
    };

    // --- AI ASSIST ---
    const handleAiAssist = async (currentText: string, setTextCallback: (t: string) => void) => {
        setIsAiThinking(true);
        playSound('AI_THINK');
        const context = messages.slice(-5).map(m => `${m.sender}: ${m.content}`).join('\n');
        const prompt = currentText ? `Draft reply for: "${currentText}". Context:\n${context}` : `Suggest reply. Context:\n${context}`;
        try {
            if (OMNI_KERNEL) {
                const stream = OMNI_KERNEL.raceStream(prompt, "Chat Assistant (Indonesian)");
                let fullDraft = '';
                for await (const chunk of stream) {
                    if (chunk.text) { fullDraft += chunk.text; setTextCallback(fullDraft); }
                }
            }
        } catch (e) {}
        setIsAiThinking(false);
    };

    // --- SEND LOGIC ---
    const sendMessage = async (type: string, content: string, extras = {}) => {
        if (!connRef.current) return;
        
        let finalContent = content;
        let isTranslated = false;

        if (type === 'TEXT' && translateTarget && content.trim().length > 0) {
            setIsAiThinking(true);
            playSound('TRANSLATE'); 
            
            const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(content), 5000));
            const translationPromise = performNeuralTranslation(content, translateTarget.name);
            
            finalContent = await Promise.race([translationPromise, timeoutPromise]);
            if (finalContent !== content) isTranslated = true;
            
            setIsAiThinking(false);
        }

        const msgId = crypto.randomUUID();
        const timestamp = Date.now();
        const payloadObj = { 
            id: msgId, type, content: finalContent, timestamp, ttl: ttlMode,
            isTranslated, originalLang: translateTarget ? translateTarget.name : undefined, ...extras 
        };
        
        const encrypted = await encryptData(JSON.stringify(payloadObj), pinRef.current);
        if (!encrypted) return;

        if (encrypted.length > CHUNK_SIZE) {
            const id = crypto.randomUUID();
            const total = Math.ceil(encrypted.length / CHUNK_SIZE);
            for(let i=0; i<total; i++) {
                connRef.current.send({
                    type: 'CHUNK', id, idx: i, total, 
                    chunk: encrypted.slice(i*CHUNK_SIZE, (i+1)*CHUNK_SIZE)
                });
            }
        } else {
            connRef.current.send({ type: 'MSG', payload: encrypted });
        }

        setMessages(p => {
            const newH = [...p, { ...payloadObj, sender: 'ME', status: 'SENT' } as Message];
            return newH.length > 100 ? newH.slice(newH.length - 100) : newH;
        });
        playSound('MSG_OUT');
    };

    // --- RENDER ---
    
    // HOME SCREEN
    if (mode === 'SELECT') {
        return (
            <div className="h-[100dvh] flex flex-col items-center justify-center p-6 relative font-sans overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                {/* Background tanpa Noise, Clean Professional */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] to-black"></div>
                <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none"></div>
                
                {/* NOTIFICATIONS */}
                {incomingRequest && (
                    <ConnectionNotification 
                        identity={incomingRequest.identity} 
                        peerId={incomingRequest.peerId} 
                        onAccept={async () => {
                            const { conn } = incomingRequest;
                            connRef.current = conn;
                            const payload = JSON.stringify({ type: 'CONNECTION_ACCEPT', identity: myProfile.username });
                            const enc = await encryptData(payload, pinRef.current);
                            if(enc) conn.send({type: 'RESP', payload: enc});
                            setStage('SECURE'); setMode('CHAT'); setIncomingRequest(null);
                            startHeartbeat();
                        }} 
                        onDecline={()=>{ setIncomingRequest(null); }} 
                    />
                )}

                <div className="text-center z-10 space-y-2 mb-10">
                    <h1 className="text-5xl font-black text-white italic tracking-tighter drop-shadow-xl">IStoic <span className="text-emerald-500">P2P</span></h1>
                    <div className="flex items-center justify-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-900/30 text-emerald-400 text-[9px] font-bold rounded border border-emerald-500/20 tracking-wider">V5.0 HYPER</span>
                        <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 text-[9px] font-bold rounded border border-blue-500/20 tracking-wider">TURN+</span>
                    </div>
                </div>

                <div className="grid gap-4 w-full max-w-xs z-10">
                    <button onClick={()=>{setAccessPin(Math.floor(100000+Math.random()*900000).toString()); setMode('HOST');}} className="group relative p-5 bg-[#0e0e10] border border-white/5 hover:border-emerald-500/50 rounded-2xl flex items-center gap-4 transition-all overflow-hidden hover:shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 relative"><Server size={24}/></div>
                        <div className="text-left relative">
                            <h3 className="text-white font-bold tracking-wide text-sm">HOST SECURE</h3>
                            <p className="text-[10px] text-neutral-500">Create Encrypted Room</p>
                        </div>
                    </button>

                    <button onClick={()=>setMode('JOIN')} className="group relative p-5 bg-[#0e0e10] border border-white/5 hover:border-blue-500/50 rounded-2xl flex items-center gap-4 transition-all overflow-hidden hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                        <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 relative"><ScanLine size={24}/></div>
                        <div className="text-left relative">
                            <h3 className="text-white font-bold tracking-wide text-sm">JOIN TARGET</h3>
                            <p className="text-[10px] text-neutral-500">Scan QR / Enter ID</p>
                        </div>
                    </button>
                    
                    <button onClick={()=>setShowSidebar(true)} className="p-4 text-neutral-500 hover:text-white text-xs font-bold tracking-widest flex items-center justify-center gap-2 transition-colors">
                        <Menu size={14}/> CONTACTS
                    </button>
                </div>

                <SidebarIStokContact isOpen={showSidebar} onClose={()=>setShowSidebar(false)} sessions={sessions} profile={myProfile} onSelect={(s)=>{ setTargetPeerId(s.id); setAccessPin(s.pin); joinSession(s.id, s.pin); setShowSidebar(false); }} onCallContact={()=>{}} onRenameSession={()=>{}} onDeleteSession={()=>{}} onRegenerateProfile={()=>{}} currentPeerId={null} />
            </div>
        );
    }

    // CONNECT MODE
    if (mode === 'HOST' || mode === 'JOIN') {
        return (
            <div className="h-[100dvh] flex flex-col items-center justify-center p-6 relative pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-black">
                {showScanner && <QRScanner onScan={handleQRScan} onClose={()=>setShowScanner(false)} />}
                <button onClick={()=>{setMode('SELECT'); setStage('IDLE');}} className="absolute top-[calc(env(safe-area-inset-top)+1.5rem)] left-6 text-neutral-500 hover:text-white flex items-center gap-2 text-xs font-bold z-20"><ArrowLeft size={16}/> ABORT</button>
                
                <div className="w-full max-w-sm bg-[#0e0e10] border border-white/5 p-8 rounded-[32px] text-center space-y-6 animate-slide-up shadow-2xl">
                    {mode === 'HOST' ? (
                        <>
                            <div className="relative inline-flex">
                                <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-10 animate-pulse"></div>
                                <Server className="text-emerald-500 relative z-10" size={48} />
                            </div>
                            <div>
                                <p className="text-[10px] text-neutral-500 font-mono mb-2 tracking-widest">SIGNAL ID</p>
                                <code className="block bg-black p-3 rounded-lg border border-white/10 text-emerald-500 text-xs font-mono break-all select-all">{myProfile.id}</code>
                            </div>
                            <div>
                                <p className="text-[10px] text-neutral-500 font-mono mb-2 tracking-widest">ACCESS PIN</p>
                                <div className="text-3xl font-black text-white tracking-[0.5em]">{accessPin}</div>
                            </div>
                            <button onClick={()=>setShowShare(true)} className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 border border-white/5"><QrCode size={14}/> SHOW QR</button>
                        </>
                    ) : (
                        <>
                            <div className="text-center mb-8">
                                <div onClick={()=>setShowScanner(true)} className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 cursor-pointer hover:bg-blue-500/20 transition border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                                    <ScanLine className="text-blue-500" size={32}/>
                                </div>
                                <h2 className="text-xl font-bold text-white">ESTABLISH UPLINK</h2>
                                <p className="text-xs text-neutral-500">Tap icon to scan Neural Code</p>
                            </div>
                            <div className="space-y-3">
                                <input value={targetPeerId} onChange={e=>setTargetPeerId(e.target.value)} placeholder="TARGET ID" className="w-full bg-black p-4 rounded-xl text-white border border-white/10 outline-none text-center font-mono focus:border-blue-500 transition-colors text-xs"/>
                                <input value={accessPin} onChange={e=>setAccessPin(e.target.value)} placeholder="PIN" className="w-full bg-black p-4 rounded-xl text-white border border-white/10 outline-none text-center font-mono tracking-widest focus:border-blue-500 transition-colors text-lg font-bold"/>
                            </div>
                            {stage === 'IDLE' ? (
                                <div className="flex gap-3 mt-4">
                                    <button onClick={()=>setShowScanner(true)} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl text-white border border-white/5"><Camera size={20}/></button>
                                    <button onClick={()=>joinSession(targetPeerId, accessPin)} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20">CONNECT</button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center mt-6 gap-2">
                                    <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                                    <span className="text-[10px] text-blue-400 font-mono animate-pulse">{stage}...</span>
                                </div>
                            )}
                            {errorMsg && <div className="text-red-500 text-[10px] text-center font-mono bg-red-500/10 p-2 rounded border border-red-500/20 mt-2">{errorMsg}</div>}
                        </>
                    )}
                </div>
                {showShare && <ShareConnection peerId={myProfile.id} pin={accessPin} onClose={()=>setShowShare(false)}/>}
            </div>
        );
    }

    // CHAT MODE
    return (
        <div className="h-[100dvh] flex flex-col font-sans relative bg-[#050505] overflow-hidden">
            {viewImage && <div className="fixed inset-0 z-[50] bg-black/95 flex items-center justify-center p-4" onClick={()=>setViewImage(null)}><img src={viewImage} className="max-w-full max-h-full rounded shadow-2xl"/></div>}
            
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#09090b] z-20 pt-[calc(env(safe-area-inset-top)+1rem)]">
                <div className="flex items-center gap-3">
                    <button onClick={()=>{connRef.current?.close(); setMode('SELECT'); setMessages([]);}} className="text-neutral-400 hover:text-white"><ArrowLeft size={20}/></button>
                    <div className={`w-2.5 h-2.5 rounded-full ${isPeerOnline ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500'}`}></div>
                    <div>
                        <h1 className="text-xs font-black text-white tracking-widest">SECURE_LINK</h1>
                        <span className="text-[8px] text-neutral-500 font-mono uppercase">{stage}</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={()=>{connRef.current?.send({type:'SIGNAL', action:'BUZZ'}); triggerHaptic(50);}} className="text-yellow-500 hover:text-yellow-400"><Zap size={18}/></button>
                    <button onClick={()=>setShowCall(true)} className="text-emerald-500 hover:text-emerald-400"><PhoneCall size={18}/></button>
                </div>
            </div>

            {/* BACKGROUND CLEAN: No Grain/Noise */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scroll bg-[#050505]">
                {messages.map(m => (
                    <MessageBubble key={m.id} msg={m} setViewImage={setViewImage} onBurn={(id: string)=>setMessages(p=>p.filter(x=>x.id!==id))} />
                ))}
                {!isPeerOnline && <div className="flex justify-center mt-4"><span className="bg-red-500/10 text-red-500 text-[10px] px-3 py-1 rounded-full flex items-center gap-2 border border-red-500/20"><WifiOff size={10}/> RECONNECTING...</span></div>}
                <div ref={msgEndRef} />
            </div>

            <IStokInput 
                onSend={(t:string)=>sendMessage('TEXT', t)}
                onTyping={()=>{}}
                disabled={!isPeerOnline}
                isRecording={isRecording}
                recordingTime={recordingTime}
                isVoiceMasked={isVoiceMasked}
                onToggleMask={()=>setIsVoiceMasked(!isVoiceMasked)}
                onStartRecord={async ()=>{
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
                        const recorder = new MediaRecorder(stream);
                        mediaRecorderRef.current = recorder;
                        audioChunksRef.current = [];
                        recorder.ondataavailable = e => audioChunksRef.current.push(e.data);
                        recorder.start();
                        setIsRecording(true);
                        setRecordingTime(0);
                        recordingIntervalRef.current = setInterval(()=>setRecordingTime(p=>p+1),1000);
                    } catch(e) { alert("Mic Error"); }
                }}
                onStopRecord={()=>{
                    if(mediaRecorderRef.current && isRecording) {
                        mediaRecorderRef.current.stop();
                        mediaRecorderRef.current.onstop = () => {
                            const blob = new Blob(audioChunksRef.current, {type:'audio/webm'});
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const b64 = (reader.result as string).split(',')[1];
                                sendMessage('AUDIO', b64, {duration:recordingTime, isMasked:isVoiceMasked});
                            };
                            reader.readAsDataURL(blob);
                            setIsRecording(false);
                            clearInterval(recordingIntervalRef.current);
                        };
                    }
                }}
                onAttach={()=>fileInputRef.current?.click()}
                ttlMode={ttlMode}
                onToggleTtl={()=>setTtlMode(p => p===0 ? 10 : (p===10 ? 60 : 0))}
                onAiAssist={handleAiAssist}
                isAiThinking={isAiThinking}
                translateTarget={translateTarget}
                setTranslateTarget={setTranslateTarget}
            />
            <input type="file" ref={fileInputRef} className="hidden" onChange={(e)=>{
                const f = e.target.files?.[0];
                if(!f) return;
                const r = new FileReader();
                r.onload = async (ev) => {
                    const res = ev.target?.result as string;
                    if(f.type.startsWith('image/')) {
                        const cmp = await compressImage(f);
                        sendMessage('IMAGE', cmp.base64.split(',')[1], {size:cmp.size});
                    } else {
                        sendMessage('FILE', res.split(',')[1], {fileName:f.name, size:f.size, mimeType:f.type});
                    }
                };
                r.readAsDataURL(f);
            }}/>

            <PWAInstallPrompt />
            
            {incomingCall && !showCall && <CallNotification identity={incomingCall.peer} onAnswer={()=>{setShowCall(true)}} onDecline={()=>{incomingCall.close(); setIncomingCall(null);}} />}
            
            {showCall && <TeleponanView onClose={()=>{setShowCall(false); setIncomingCall(null);}} existingPeer={peerRef.current} initialTargetId={targetPeerId} incomingCall={incomingCall} secretPin={pinRef.current}/>}
        </div>
    );
};