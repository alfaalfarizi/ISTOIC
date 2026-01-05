
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
    encryptData, decryptData
} from '../../utils/crypto'; 
import { TeleponanView } from '../teleponan/TeleponanView';
import { activatePrivacyShield } from '../../utils/privacyShield';
import { 
    Send, Zap, Radio, ScanLine, Server,
    Clock, Check, CheckCheck,
    Mic, MicOff, Square,
    Menu, Skull, Activity,
    PhoneCall, QrCode, User, Shield, AlertTriangle, History, ArrowRight,
    X, RefreshCw, Lock, Flame, ShieldAlert, Image as ImageIcon, Loader2, ArrowLeft, Wifi, UploadCloud
} from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import { SidebarIStokContact, IStokSession } from './components/SidebarIStokContact';
import { ShareConnection } from './components/ShareConnection'; 
import { ConnectionNotification } from './components/ConnectionNotification';
import { CallNotification } from './components/CallNotification';
import { MessageNotification } from './components/MessageNotification';
import { AudioMessagePlayer, getSupportedMimeType } from './components/vn';
import { compressImage, ImageMessage } from './components/gambar';
import { IStokAuth } from './components/IStokAuth';

// --- CONSTANTS ---
const CHUNK_SIZE = 16384; 

// --- TYPES ---
interface IStokProfile {
    id: string;        
    username: string;  
    bio?: string;
    publicKey?: string; 
    created: number;
}

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
}

type AppMode = 'SELECT' | 'HOST' | 'JOIN' | 'CHAT' | 'DIALING' | 'INCOMING_CALL';
type ConnectionStage = 'IDLE' | 'FETCHING_ICE' | 'LOCATING_PEER' | 'VERIFYING_KEYS' | 'ESTABLISHING_TUNNEL' | 'AWAITING_APPROVAL' | 'SECURE' | 'RECONNECTING';

// --- SUB-COMPONENTS ---

/**
 * Component for resuming an existing session or starting a new one.
 */
const ResumeSessionModal = ({ targetSession, onResume, onNew, onCancel }: any) => (
    <div className="fixed inset-0 z-[11000] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
        <div className="bg-[#0f0f11] border border-white/10 rounded-[32px] p-8 max-w-sm w-full text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/20">
                <History size={32} />
            </div>
            <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase italic">Resume Session?</h3>
                <p className="text-xs text-neutral-500 uppercase tracking-widest leading-relaxed">
                    Identitas "{targetSession.name}" terdeteksi. Gunakan kunci lama atau mulai baru?
                </p>
            </div>
            <div className="flex flex-col gap-3">
                <button onClick={onResume} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all">RESUME_UPLINK</button>
                <button onClick={onNew} className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">NEW_ENCRYPTION_KEY</button>
                <button onClick={onCancel} className="w-full py-3 text-neutral-500 hover:text-white text-[10px] font-bold uppercase tracking-widest">CANCEL</button>
            </div>
        </div>
    </div>
);

/**
 * Component for viewing full-size images.
 */
const ImageViewerModal = ({ src, onClose }: { src: string, onClose: () => void }) => (
    <div className="fixed inset-0 z-[12000] bg-black/95 backdrop-blur-xl flex flex-col p-4 animate-fade-in" onClick={onClose}>
        <div className="flex justify-end p-4"><button onClick={onClose} className="p-3 bg-white/10 rounded-full text-white"><X size={24}/></button></div>
        <div className="flex-1 flex items-center justify-center p-4">
            <img src={src} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Full view" />
        </div>
    </div>
);

/**
 * Component for previewing and sending secure attachments.
 */
const SecureAttachmentModal = ({ image, onSend, onCancel }: { image: any, onSend: () => void, onCancel: () => void }) => (
    <div className="fixed inset-0 z-[11000] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
        <div className="bg-[#0f0f11] border border-white/10 rounded-[32px] p-6 max-w-sm w-full space-y-6 shadow-2xl">
            <div className="aspect-square rounded-2xl overflow-hidden border border-white/10 bg-black">
                <img src={image.base64} className="w-full h-full object-cover" alt="Preview" />
            </div>
            <div className="text-center">
                <h3 className="text-lg font-black text-white uppercase italic">Secure Attachment</h3>
                <p className="text-[10px] text-neutral-500 uppercase font-mono mt-1">Size: {(image.size/1024).toFixed(1)}KB // AES-256 Enabled</p>
            </div>
            <div className="flex gap-3">
                <button onClick={onCancel} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/10 transition-all">CANCEL</button>
                <button onClick={onSend} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all">SEND_ENCRYPTED</button>
            </div>
        </div>
    </div>
);

/**
 * Component for message and media input in IStok.
 */
const IStokInput = ({ onSend, onTyping, disabled, isRecording, onStartRecord, onStopRecord, onAttach, ttlMode, onToggleTtl, uploadProgress }: any) => {
    const [val, setVal] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (val.trim() && !disabled) {
            onSend(val.trim());
            setVal('');
        }
    };

    return (
        <div className="p-4 bg-[#09090b] border-t border-white/10 pb-[max(env(safe-area-inset-bottom),1rem)]">
            {uploadProgress > 0 && (
                <div className="mb-3 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${uploadProgress}%`}}></div>
                </div>
            )}
            <div className="flex items-center gap-2">
                <button onClick={onToggleTtl} className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${ttlMode > 0 ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-white/5 border-white/5 text-neutral-500'}`} title={`Self Destruct: ${ttlMode}s`}>
                    <Flame size={18} className={ttlMode > 0 ? 'animate-pulse' : ''} />
                </button>
                <button onClick={onAttach} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 text-neutral-500 hover:text-white transition-all"><ImageIcon size={18}/></button>
                
                <form onSubmit={handleSubmit} className="flex-1 relative">
                    <input 
                        ref={inputRef}
                        value={val}
                        onChange={(e) => { setVal(e.target.value); onTyping(); }}
                        placeholder="Type encrypted message..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-neutral-800"
                    />
                    <button type="submit" disabled={!val.trim() || disabled} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 disabled:opacity-30"><Send size={18}/></button>
                </form>

                <button 
                    onMouseDown={onStartRecord} 
                    onMouseUp={onStopRecord}
                    onTouchStart={(e) => { e.preventDefault(); onStartRecord(); }}
                    onTouchEnd={(e) => { e.preventDefault(); onStopRecord(); }}
                    className={`w-12 h-12 flex items-center justify-center rounded-full transition-all active:scale-90 ${isRecording ? 'bg-red-500 text-white animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-neutral-500'}`}
                >
                    {isRecording ? <Square size={16} fill="currentColor"/> : <Mic size={20}/>}
                </button>
            </div>
        </div>
    );
};

// --- UTILS ---

const generateAnomalyIdentity = () => `ANOMALY-${Math.floor(Math.random() * 9000) + 1000}`;
const generateStableId = () => `ISTOK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

const triggerHaptic = (ms: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
    }
};

// --- SMART NOTIFICATION SYSTEM V2 ---
const sendSmartNotification = (title: string, body: string, peerId: string, currentTargetId: string) => {
    const isAppVisible = document.visibilityState === 'visible';
    const isChattingWithSender = isAppVisible && currentTargetId === peerId;

    if (isChattingWithSender) return;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            payload: {
                title: title,
                body: body,
                tag: peerId,
                data: { peerId: peerId }
            }
        });
    } else if ("Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(title, {
            body: body,
            icon: 'https://grainy-gradients.vercel.app/noise.svg',
            tag: peerId,
            vibrate: [100, 50, 100]
        } as any);
        notif.onclick = () => {
            window.focus();
            window.dispatchEvent(new CustomEvent('ISTOK_NAVIGATE', { detail: { peerId } }));
        };
    }
};

const requestNotificationPermission = () => {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
};

const playSound = (type: 'MSG_IN' | 'MSG_OUT' | 'CONNECT' | 'CALL_RING' | 'ERROR' | 'BUZZ') => {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'MSG_IN') {
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'MSG_OUT') {
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'CONNECT') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'CALL_RING') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.setValueAtTime(1000, now + 0.5);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setValueAtTime(0, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'BUZZ') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
};

const getIceServers = async (): Promise<any[]> => {
    const meteredKey = process.env.VITE_METERED_API_KEY;
    const meteredDomain = process.env.VITE_METERED_DOMAIN || 'istok.metered.live';
    if (meteredKey) {
        try {
            const response = await fetch(`https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredKey}`);
            return await response.json();
        } catch (e) {
            console.warn("[ISTOK_NET] TURN Fail", e);
        }
    }
    return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ];
};

const BurnerTimer = ({ ttl, onBurn }: { ttl: number, onBurn: () => void }) => {
    const [timeLeft, setTimeLeft] = useState(ttl);
    useEffect(() => {
        if (timeLeft <= 0) { onBurn(); return; }
        const timer = setInterval(() => setTimeLeft(p => p - 1), 1000);
        return () => clearInterval(timer);
    }, [timeLeft, onBurn]);
    return (
        <div className="flex items-center gap-2 mt-1">
            <Flame size={10} className="text-red-500 animate-pulse" />
            <div className="w-full h-1 bg-red-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 transition-all duration-1000 ease-linear" style={{width: `${(timeLeft/ttl)*100}%`}}></div>
            </div>
        </div>
    );
};

const MessageBubble = React.memo(({ msg, setViewImage, onBurn }: { msg: Message, setViewImage: (img: string) => void, onBurn: (id: string) => void }) => {
    const [burnStarted, setBurnStarted] = useState(msg.type !== 'IMAGE');
    return (
        <div className={`flex ${msg.sender === 'ME' ? 'justify-end' : 'justify-start'} animate-fade-in mb-4`}>
            <div className={`max-w-[85%] flex flex-col ${msg.sender === 'ME' ? 'items-end' : 'items-start'}`}>
                <div className={`p-2 rounded-2xl text-sm border ${msg.sender === 'ME' ? 'bg-blue-600/20 border-blue-500/30 text-blue-100' : 'bg-[#1a1a1a] text-neutral-200 border-white/10'} ${msg.type === 'TEXT' ? 'px-4 py-3' : 'p-1'}`}>
                    {msg.type === 'IMAGE' ? <ImageMessage content={msg.content} size={msg.size} onClick={() => setViewImage(msg.content)} onReveal={() => setBurnStarted(true)} /> : 
                     msg.type === 'AUDIO' ? <AudioMessagePlayer src={msg.content} duration={msg.duration} /> :
                     msg.type === 'FILE' ? <a href={`data:${msg.mimeType};base64,${msg.content}`} download={msg.fileName} className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/10"><span className="text-xs truncate max-w-[150px]">{msg.fileName}</span></a> : msg.content}
                    {msg.ttl && burnStarted && <BurnerTimer ttl={msg.ttl} onBurn={() => onBurn(msg.id)} />}
                </div>
                <div className="flex items-center gap-1 mt-1 px-1">
                    {msg.status === 'PENDING' && <Loader2 size={8} className="animate-spin text-neutral-500" />}
                    {msg.status === 'SENT' && <Check size={8} className="text-neutral-500" />}
                    {msg.status === 'READ' && <CheckCheck size={8} className="text-emerald-500" />}
                    <span className="text-[9px] text-neutral-600">{new Date(msg.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
            </div>
        </div>
    );
});

export const IStokView: React.FC = () => {
    const [mode, setMode] = useState<AppMode>('SELECT');
    const [stage, setStage] = useState<ConnectionStage>('IDLE');
    
    const [myProfile, setMyProfile] = useLocalStorage<IStokProfile>('istok_profile_v1', {
        id: generateStableId(),
        username: generateAnomalyIdentity(),
        created: Date.now()
    });

    const [sessions, setSessions] = useLocalStorage<IStokSession[]>('istok_sessions', []);
    const [lastTargetId, setLastTargetId] = useLocalStorage<string>('istok_last_target_id', '');
    const [targetPeerId, setTargetPeerId] = useState<string>('');
    const [accessPin, setAccessPin] = useState<string>('');
    const [showResumeModal, setShowResumeModal] = useState(false);
    const [resumeTargetSession, setResumeTargetSession] = useState<IStokSession | null>(null);
    const [ttlMode, setTtlMode] = useState<number>(0);
    const [pendingImage, setPendingImage] = useState<{base64: string, size: number} | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const chunkBuffer = useRef<Record<string, { chunks: string[], count: number, total: number }>>({});
    const [showSidebar, setShowSidebar] = useState(false);
    const [showShare, setShowShare] = useState(false); // Fix: Added missing state

    const [viewImage, setViewImage] = useState<string | null>(null);
    const [showCall, setShowCall] = useState(false); 
    const [incomingConnectionRequest, setIncomingConnectionRequest] = useState<{ peerId: string, identity: string, conn: any } | null>(null);
    const [incomingCallObject, setIncomingCallObject] = useState<any>(null); 
    const [latestNotification, setLatestNotification] = useState<{ sender: string, text: string } | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [peerTyping, setPeerTyping] = useState(false);
    const [isPeerOnline, setIsPeerOnline] = useState(false);
    const [isRelayActive, setIsRelayActive] = useState(false);
    const peerRef = useRef<any>(null);
    const connRef = useRef<any>(null);
    const msgEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pinRef = useRef(accessPin); 
    const heartbeatIntervalRef = useRef<any>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<any>(null);
    const isMounted = useRef(true);

    const handleToggleTtl = () => setTtlMode(p => p === 0 ? 10 : p === 10 ? 60 : 0);
    const handleDeleteMessage = useCallback((id: string) => setMessages(p => p.filter(m => m.id !== id)), []);

    const handlePreConnectCheck = (id: string, pin?: string) => {
        const existing = sessions.find(s => s.id === id);
        if (existing) {
            setResumeTargetSession(existing);
            setTargetPeerId(existing.id);
            setAccessPin(pin || existing.pin);
            setShowResumeModal(true);
        } else {
            setTargetPeerId(id);
            if (pin) setAccessPin(pin);
            setLastTargetId(id);
            setMode('JOIN');
            setTimeout(() => joinSession(id, pin), 200);
        }
    };

    const handleSelectContact = (session: IStokSession) => {
        setShowSidebar(false);
        setStage('IDLE');
        handlePreConnectCheck(session.id, session.pin);
    };

    const handleLeaveChat = () => {
        if (connRef.current) connRef.current.close();
        setMessages([]); setStage('IDLE'); setMode('SELECT'); setTargetPeerId(''); setIsPeerOnline(false);
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };

    const acceptConnection = async () => {
        if (!incomingConnectionRequest) return;
        const { conn, identity, peerId } = incomingConnectionRequest;
        connRef.current = conn;
        const payload = JSON.stringify({ type: 'CONNECTION_ACCEPT', identity: myProfile.username });
        const encrypted = await encryptData(payload, pinRef.current);
        if (encrypted) {
            conn.send({ type: 'RESP', payload: encrypted });
            setStage('SECURE'); setMode('CHAT'); setIncomingConnectionRequest(null);
            const now = Date.now();
            setSessions(prev => {
                const ex = prev.find(s => s.id === peerId);
                if (ex) return prev.map(s => s.id === peerId ? { ...s, lastSeen: now, status: 'ONLINE', name: identity } : s);
                return [...prev, { id: peerId, name: identity, lastSeen: now, status: 'ONLINE', pin: pinRef.current, createdAt: now }];
            });
            playSound('CONNECT'); startHeartbeat();
        }
    };

    useEffect(() => {
        activatePrivacyShield(); isMounted.current = true;
        const handleServiceWorkerMessage = (e: MessageEvent) => {
            if (e.data && e.data.type === 'NAVIGATE_CHAT') {
                const sess = sessions.find(s => s.id === e.data.peerId);
                if (sess) handleSelectContact(sess);
            }
        };
        navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
        return () => { isMounted.current = false; navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage); };
    }, [sessions]);

    useEffect(() => { pinRef.current = accessPin; }, [accessPin]);
    useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, peerTyping]);

    useEffect(() => {
        if (peerRef.current && !peerRef.current.destroyed) return;
        const initPeer = async () => {
            try {
                const iceServers = await getIceServers();
                if (iceServers.some((s: any) => s.urls.includes('turn:'))) setIsRelayActive(true);
                const { Peer } = await import('peerjs');
                const peer = new Peer(myProfile.id, { secure: true, config: { iceServers, sdpSemantics: 'unified-plan', iceTransportPolicy: 'all' } });
                peer.on('open', () => setStage('IDLE'));
                peer.on('connection', handleIncomingConnection);
                peer.on('call', (mediaConn) => {
                    if (showCall || incomingCallObject) return;
                    setIncomingCallObject(mediaConn); playSound('CALL_RING');
                    const caller = sessions.find(s => s.id === mediaConn.peer)?.name || 'UNKNOWN CALLER';
                    sendSmartNotification("INCOMING CALL", `From ${caller}`, mediaConn.peer, targetPeerId);
                });
                peer.on('error', (err: any) => {
                    if (err.type === 'peer-unavailable') setErrorMsg('TARGET_OFFLINE');
                    else if (err.type === 'fatal') setStage('RECONNECTING');
                });
                peerRef.current = peer;
            } catch (e) { setErrorMsg("INIT_FAIL"); }
        };
        initPeer();
        return () => { clearInterval(heartbeatIntervalRef.current); peerRef.current?.destroy(); };
    }, [myProfile.id]);

    const startHeartbeat = () => {
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
            if (!connRef.current?.open) setIsPeerOnline(false);
        }, 5000);
        setIsPeerOnline(true);
    };

    const joinSession = (id?: string, pin?: string) => {
        const target = id || targetPeerId;
        const key = pin || accessPin;
        if (!target || !key) return;
        setErrorMsg(''); setStage('LOCATING_PEER');
        try {
            const conn = peerRef.current.connect(target, { reliable: true });
            if (!conn) { setErrorMsg('CONNECTION_FAILED'); setStage('IDLE'); return; }
            connRef.current = conn;
            conn.on('open', async () => {
                setStage('VERIFYING_KEYS');
                const payload = JSON.stringify({ type: 'CONNECTION_REQUEST', identity: myProfile.username });
                const encrypted = await encryptData(payload, key);
                if (encrypted) conn.send({ type: 'REQ', payload: encrypted });
                else { setStage('IDLE'); setErrorMsg('ENCRYPTION_FAIL'); }
            });
            conn.on('data', handleData);
            conn.on('close', () => { setStage('IDLE'); setIsPeerOnline(false); });
            conn.on('error', () => { setErrorMsg('TARGET_OFFLINE'); setStage('IDLE'); });
        } catch(e) { setStage('IDLE'); setErrorMsg('CONNECT_ERROR'); }
    };

    const handleIncomingConnection = (conn: any) => {
        conn.on('data', (data: any) => handleData(data, conn));
        conn.on('close', () => setIsPeerOnline(false));
    };

    const handleData = async (data: any, incomingConn?: any) => {
        if (data.type === 'CHUNK') {
            const { transferId, idx, total, data: chunkData } = data;
            if (!chunkBuffer.current[transferId]) chunkBuffer.current[transferId] = { chunks: new Array(total), count: 0, total };
            const buf = chunkBuffer.current[transferId];
            if (!buf.chunks[idx]) { buf.chunks[idx] = chunkData; buf.count++; }
            if (buf.count === total) { const full = buf.chunks.join(''); delete chunkBuffer.current[transferId]; handleData({ type: 'MSG', payload: full }); }
            return;
        }
        if (data.type === 'REQ') {
            const json = await decryptData(data.payload, pinRef.current);
            if (json) {
                const req = JSON.parse(json);
                setIncomingConnectionRequest({ peerId: incomingConn.peer, identity: req.identity, conn: incomingConn });
                playSound('MSG_IN');
            }
        } else if (data.type === 'RESP') {
            const json = await decryptData(data.payload, pinRef.current);
            if (json) {
                const res = JSON.parse(json);
                setStage('SECURE'); setMode('CHAT'); playSound('CONNECT'); startHeartbeat();
                const now = Date.now();
                setSessions(prev => {
                    const ex = prev.find(s => s.id === connRef.current.peer);
                    if (ex) return prev.map(s => s.id === connRef.current.peer ? { ...s, lastSeen: now, status: 'ONLINE', name: res.identity } : s);
                    return [...prev, { id: connRef.current.peer, name: res.identity, lastSeen: now, status: 'ONLINE', pin: accessPin || pinRef.current, createdAt: now }];
                });
            }
        } else if (data.type === 'MSG') {
            const json = await decryptData(data.payload, pinRef.current);
            if (json) {
                const msg = JSON.parse(json);
                setMessages(prev => [...prev, { ...msg, sender: 'THEM', status: 'READ' }]);
                playSound('MSG_IN');
                const sender = sessions.find(s => s.id === connRef.current?.peer)?.name || 'ANOMALY';
                sendSmartNotification(sender, msg.type === 'TEXT' ? msg.content : `Sended a ${msg.type}`, connRef.current?.peer, targetPeerId);
            }
        } else if (data.type === 'SIGNAL') {
            if (data.action === 'TYPING') { setPeerTyping(true); setTimeout(() => setPeerTyping(false), 2000); }
            else if (data.action === 'BUZZ') { triggerHaptic([200, 100, 200]); playSound('BUZZ'); }
            else if (data.action === 'NUKE') { setMessages([]); alert("PEER NUKE PROTOCOL: History Cleared."); }
        }
    };

    const sendMessage = async (type: string, content: string, extra: any = {}) => {
        if (!connRef.current?.open || !content) return;
        const msgId = crypto.randomUUID(); const ts = Date.now();
        const msgObj: Message = { id: msgId, sender: 'ME', type: type as any, content, timestamp: ts, status: 'PENDING', ttl: ttlMode > 0 ? ttlMode : undefined, ...extra };
        setMessages(p => [...p, msgObj]);
        const encrypted = await encryptData(JSON.stringify({ ...msgObj, sender: 'THEM' }), pinRef.current);
        if (encrypted) {
            if (encrypted.length > CHUNK_SIZE) {
                const tid = crypto.randomUUID(); const tot = Math.ceil(encrypted.length / CHUNK_SIZE);
                for (let i = 0; i < tot; i++) {
                    connRef.current.send({ type: 'CHUNK', transferId: tid, idx: i, total: tot, data: encrypted.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
                    setUploadProgress(Math.round(((i + 1) / tot) * 100));
                    await new Promise(r => setTimeout(r, 5));
                }
                setUploadProgress(0);
            } else connRef.current.send({ type: 'MSG', payload: encrypted });
            setMessages(p => p.map(m => m.id === msgId ? { ...m, status: 'SENT' } : m));
            playSound('MSG_OUT');
        }
    };

    if (mode === 'SELECT') {
        return (
            <div className="h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center px-6 space-y-12 relative overflow-hidden font-sans">
                 {showResumeModal && resumeTargetSession && <ResumeSessionModal targetSession={resumeTargetSession} onResume={() => { setShowResumeModal(false); setMode('JOIN'); joinSession(resumeTargetSession.id, resumeTargetSession.pin); }} onNew={() => { setShowResumeModal(false); setMessages([]); setMode('JOIN'); joinSession(resumeTargetSession.id, accessPin); }} onCancel={() => setShowResumeModal(false)} />}
                 {incomingConnectionRequest && <ConnectionNotification identity={incomingConnectionRequest.identity} peerId={incomingConnectionRequest.peerId} onAccept={acceptConnection} onDecline={() => setIncomingConnectionRequest(null)} />}
                 {incomingCallObject && !showCall && <CallNotification identity={sessions.find(s => s.id === incomingCallObject.peer)?.name || 'UNKNOWN CALLER'} onAnswer={() => setShowCall(true)} onDecline={() => { incomingCallObject.close(); setIncomingCallObject(null); }} />}
                 <SidebarIStokContact isOpen={showSidebar} onClose={() => setShowSidebar(false)} sessions={sessions} onSelect={handleSelectContact} onRename={(id, n) => setSessions(p => p.map(s => s.id === id ? { ...s, customName: n } : s))} onDelete={id => setSessions(p => p.filter(s => s.id !== id))} currentPeerId={myProfile.id} />
                 <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-6 z-20"><button onClick={() => setShowSidebar(true)} className="p-3 bg-white/5 rounded-full text-white hover:bg-white/10 transition-all"><Menu size={20} /></button></div>
                 <div className="text-center space-y-4 z-10"><h1 className="text-5xl font-black text-white italic tracking-tighter">IStoic <span className="text-emerald-500">P2P</span></h1><p className="text-xs text-neutral-500 font-mono uppercase tracking-widest">SECURE RELAY PROTOCOL v0.55</p></div>
                 <div className="grid grid-cols-1 gap-6 w-full max-w-sm z-10">
                    <button onClick={() => { setAccessPin(Math.floor(100000 + Math.random()*900000).toString()); setMode('HOST'); requestNotificationPermission(); }} className="p-8 bg-white/5 border border-white/10 rounded-[32px] flex items-center gap-6 hover:bg-white/10 transition-all active:scale-[0.98] group"><div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Server size={28}/></div><div className="text-left"><h3 className="font-black text-white uppercase tracking-tight">HOST_FREQ</h3><p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-1">Create Secure Uplink</p></div></button>
                    <button onClick={() => { setMode('JOIN'); requestNotificationPermission(); }} className="p-8 bg-white/5 border border-white/10 rounded-[32px] flex items-center gap-6 hover:bg-white/10 transition-all active:scale-[0.98] group"><div className="w-14 h-14 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><ScanLine size={28}/></div><div className="text-left"><h3 className="font-black text-white uppercase tracking-tight">JOIN_FREQ</h3><p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-1">Link with Anomaly</p></div></button>
                 </div>
            </div>
        );
    }

    if (mode === 'HOST' || mode === 'JOIN') {
        return (
            <div className="h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center px-6 relative font-sans">
                 <button onClick={() => { setMode('SELECT'); setStage('IDLE'); }} className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-6 text-neutral-500 hover:text-white flex items-center gap-2 text-xs font-black uppercase tracking-widest z-20 transition-all">ABORT_TRANS</button>
                 {mode === 'HOST' ? (
                     <div className="w-full max-w-md bg-[#09090b] border border-white/10 p-10 rounded-[48px] text-center space-y-8 shadow-2xl relative overflow-hidden">
                         <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 animate-pulse"></div>
                         <div className="relative inline-block"><div className="absolute inset-0 bg-emerald-500 blur-[60px] opacity-20 animate-pulse"></div><Server className="text-emerald-500 relative z-10 mx-auto" size={56} /></div>
                         <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Broadcasting...</h2>
                         <div className="p-6 bg-black rounded-3xl border border-white/5 space-y-6">
                            <div><p className="text-[9px] text-neutral-500 font-black uppercase tracking-widest mb-2">My_Node_ID</p><code className="text-emerald-500 text-sm font-mono select-all block break-all leading-tight">{myProfile.id}</code></div>
                            <div><p className="text-[9px] text-neutral-500 font-black uppercase tracking-widest mb-2">Access_Key</p><p className="text-3xl font-black text-white tracking-[0.5em] tabular-nums">{accessPin}</p></div>
                         </div>
                         <button onClick={() => setShowShare(true)} className="w-full py-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95"><QrCode size={18} /> SHARE_CONNECTION</button>
                     </div>
                 ) : (
                     <IStokAuth identity={myProfile.username} onRegenerateIdentity={() => setMyProfile(p => ({ ...p, username: generateAnomalyIdentity() }))} onHost={() => {}} onJoin={(id, pin) => joinSession(id, pin)} errorMsg={errorMsg} onErrorClear={() => {setErrorMsg(''); setStage('IDLE');}} isRelayActive={isRelayActive} forcedMode="JOIN" connectionStage={stage} />
                 )}
                 {showShare && <ShareConnection peerId={myProfile.id} pin={accessPin} onClose={() => setShowShare(false)} />}
            </div>
        );
    }

    return (
        <div className="h-[100dvh] w-full bg-[#050505] flex flex-col font-sans relative overflow-hidden">
             {viewImage && <ImageViewerModal src={viewImage} onClose={() => setViewImage(null)} />}
             {pendingImage && <SecureAttachmentModal image={pendingImage} onSend={() => { if(pendingImage) sendMessage('IMAGE', pendingImage.base64.split(',')[1], { size: pendingImage.size }); setPendingImage(null); }} onCancel={() => setPendingImage(null)} />}
             {latestNotification && <MessageNotification senderName={latestNotification.sender} messagePreview={latestNotification.text} onDismiss={() => setLatestNotification(null)} onClick={() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setLatestNotification(null); }} />}
             {showCall && <TeleponanView onClose={() => { setShowCall(false); setIncomingCallObject(null); }} existingPeer={peerRef.current} initialTargetId={targetPeerId} incomingCall={incomingCallObject} secretPin={accessPin || pinRef.current} />}
             <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#09090b] z-10 pt-[calc(env(safe-area-inset-top)+1rem)]">
                 <div className="flex items-center gap-3"><button onClick={handleLeaveChat} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"><ArrowLeft size={22} /></button><div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_#10b981] ${isPeerOnline ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div><div><h1 className="text-xs font-black text-white tracking-widest">SECURE_LINK</h1>{peerTyping ? <span className="text-[8px] text-emerald-500 animate-pulse uppercase font-black">Typing...</span> : <span className="text-[8px] text-neutral-500 font-mono uppercase tracking-widest">{targetPeerId.slice(0,12)}</span>}</div></div>
                 <div className="flex gap-2"><button onClick={() => { triggerHaptic(100); connRef.current?.send({ type: 'SIGNAL', action: 'BUZZ' }); }} className="p-2 rounded-full hover:bg-white/5 text-yellow-500 transition-all active:scale-90"><Zap size={20} fill="currentColor" /></button><button onClick={() => setShowCall(true)} className="p-2 rounded-full hover:bg-white/5 text-emerald-500 active:scale-90 transition-all"><PhoneCall size={20}/></button></div>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scroll bg-noise pb-4">{messages.map((msg) => (<MessageBubble key={msg.id} msg={msg} setViewImage={setViewImage} onBurn={handleDeleteMessage} />))}<div ref={msgEndRef} /></div>
             <IStokInput onSend={(txt:any) => sendMessage('TEXT', txt)} onTyping={() => connRef.current?.send({ type: 'SIGNAL', action: 'TYPING' })} disabled={mode !== 'CHAT'} isRecording={isRecording} onStartRecord={async () => { try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); const mr = new MediaRecorder(st); mediaRecorderRef.current = mr; audioChunksRef.current = []; mr.ondataavailable = e => e.data.size > 0 && audioChunksRef.current.push(e.data); mr.onstop = () => { const b = new Blob(audioChunksRef.current, { type: 'audio/webm' }); const r = new FileReader(); r.onloadend = () => sendMessage('AUDIO', (r.result as string).split(',')[1], { duration: recordingTime }); st.getTracks().forEach(t => t.stop()); }; mr.start(); setIsRecording(true); setRecordingTime(0); recordingIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000); } catch(e) { alert("Mic access denied"); } }} onStopRecord={() => { if(mediaRecorderRef.current) mediaRecorderRef.current.stop(); setIsRecording(false); clearInterval(recordingIntervalRef.current); }} onAttach={() => fileInputRef.current?.click()} ttlMode={ttlMode} onToggleTtl={handleToggleTtl} uploadProgress={uploadProgress} />
             <input type="file" ref={fileInputRef} className="hidden" onChange={(e:any) => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = async (evt:any) => { if(f.type.startsWith('image/')) { try { const c = await compressImage(f); setPendingImage({ base64: c.base64, size: c.size }); } catch { sendMessage('IMAGE', (evt.target.result as string).split(',')[1], { size: f.size }); } } else sendMessage('FILE', (evt.target.result as string).split(',')[1], { fileName: f.name, size: f.size, mimeType: f.type }); }; r.readAsDataURL(f); }} accept="image/*,audio/*,.pdf,.txt" />
        </div>
    );
};
