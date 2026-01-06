import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { v4 as uuidv4 } from 'uuid';
import { 
    encryptData, decryptData
} from '../../utils/crypto'; 
import { TeleponanView } from '../teleponan/TeleponanView';
import { 
    Send, Server, ScanLine, Users, Mic, Square,
    Phone, Skull, ArrowLeft, WifiOff, 
    X, Radio as RadioIcon, Paperclip, Wifi
} from 'lucide-react';

// --- HOOKS & UTILS ---
import useLocalStorage from '../../hooks/useLocalStorage';
import { useIDB } from '../../hooks/useIDB'; 

// --- COMPONENTS ---
import { SidebarIStokContact, IStokSession, IStokProfile, IStokContact } from './components/SidebarIStokContact';
import { ShareConnection } from './components/ShareConnection'; 
import { ConnectionNotification } from './components/ConnectionNotification';
import { CallNotification } from './components/CallNotification';
import { IStokAuth } from './components/IStokAuth';
import { IStokWalkieTalkie } from './components/IStokWalkieTalkie';
import { MessageBubble } from './components/MessageBubble'; // Pastikan file ini dibuat (lihat di bawah)
import { compressImage } from './components/gambar';
import { getSupportedMimeType } from './components/vn';

// --- TYPES ---
const HEARTBEAT_INTERVAL = 3000;
const CHUNK_SIZE = 16 * 1024;

interface Message {
    id: string;
    sender: 'ME' | 'THEM';
    type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'FILE';
    content: string; 
    timestamp: number;
    status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
    duration?: number;
    size?: number;
    mimeType?: string;
    fileName?: string;
}

type AppMode = 'SELECT' | 'HOST' | 'JOIN' | 'CHAT';
type ConnectionStage = 'IDLE' | 'LOCATING_PEER' | 'HANDSHAKE_INIT' | 'VERIFYING_KEYS' | 'SECURE' | 'RECONNECTING';

// --- UTILS ---
const generateStableId = () => `ISTOK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateAnomalyIdentity = () => `ANOMALY-${Math.floor(Math.random() * 9000) + 1000}`;

const getIceServers = async (): Promise<any[]> => {
    // Gunakan Public STUN Google sebagai default yang stabil
    return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ];
};

const playSound = (type: 'MSG_IN' | 'MSG_OUT' | 'CONNECT' | 'CALL_RING') => {
    try {
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
        } else if (type === 'CONNECT') {
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'CALL_RING') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        }
    } catch (e) {}
};

// --- SUB-COMPONENT: INPUT ---
const IStokInput = React.memo(({ onSend, onTyping, disabled, isRecording, recordingTime, onStartRecord, onStopRecord, onAttach, onTogglePTT }: any) => {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="bg-[#09090b] border-t border-white/10 p-3 pb-[max(env(safe-area-inset-bottom),1rem)] z-20">
            <div className="flex gap-2 items-end">
                <button onClick={onAttach} className="p-3 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"><Paperclip size={20}/></button>
                <div className="flex-1 bg-white/5 rounded-2xl px-4 py-3 border border-white/5 focus-within:border-emerald-500/50 transition-colors">
                    <input 
                        ref={inputRef}
                        value={text} 
                        onChange={(e) => { setText(e.target.value); onTyping(true); }} 
                        onBlur={() => onTyping(false)}
                        onKeyDown={e=>e.key==='Enter'&&text.trim()&&(onSend(text),setText(''))} 
                        placeholder={isRecording ? `Recording... ${recordingTime}s` : "Pesan Terenkripsi..."}
                        className="w-full bg-transparent outline-none text-white text-sm placeholder:text-neutral-600" 
                        disabled={disabled || isRecording}
                    />
                </div>
                {text.trim() ? (
                    <button onClick={()=>{onSend(text);setText(''); inputRef.current?.focus();}} className="p-3 bg-emerald-600 hover:bg-emerald-500 rounded-full text-white transition-all shadow-lg active:scale-95"><Send size={20}/></button>
                ) : (
                    <>
                        <button onClick={onTogglePTT} className="p-3 rounded-full bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-black transition-all"><RadioIcon size={20} /></button>
                        <button 
                            onMouseDown={onStartRecord} onMouseUp={onStopRecord} 
                            onTouchStart={onStartRecord} onTouchEnd={onStopRecord} 
                            className={`p-3 rounded-full transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse scale-110' : 'bg-white/5 text-neutral-400 hover:text-white'}`}
                        >
                            {isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
});

// --- MAIN COMPONENT ---
export const IStokView: React.FC = () => {
    // State Aplikasi
    const [mode, setMode] = useState<AppMode>('SELECT');
    const [stage, setStage] = useState<ConnectionStage>('IDLE');
    const [errorMsg, setErrorMsg] = useState<string>('');
    
    // Data User
    const [myProfile, setMyProfile] = useLocalStorage<IStokProfile>('istok_profile_v1', {
        id: generateStableId(),
        username: generateAnomalyIdentity(),
        created: Date.now(),
        idChangeHistory: []
    });
    const [sessions, setSessions] = useLocalStorage<IStokSession[]>('istok_sessions', []);
    
    // Koneksi Data
    const [targetPeerId, setTargetPeerId] = useState<string>('');
    const [accessPin, setAccessPin] = useState<string>('');
    const [pendingJoin, setPendingJoin] = useState<{id: string, pin: string} | null>(null);

    // Refs
    const peerRef = useRef<any>(null);
    const connRef = useRef<any>(null);
    const pinRef = useRef(accessPin); // Selalu sync dengan state
    const heartbeatRef = useRef<any>(null);
    const msgEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chunkBuffer = useRef<Record<string, any>>({});

    // UI States
    const [messages, setMessages] = useState<Message[]>([]);
    const [incomingRequest, setIncomingRequest] = useState<{ peerId: string, identity: string, conn: any } | null>(null);
    const [isPeerOnline, setIsPeerOnline] = useState(false);
    const [isHandshaking, setIsHandshaking] = useState(false); // Loading state saat terima request
    const [showContactSidebar, setShowContactSidebar] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [showWalkieTalkie, setShowWalkieTalkie] = useState(false);
    const [viewImage, setViewImage] = useState<string | null>(null);

    // Calling States
    const [incomingMediaCall, setIncomingMediaCall] = useState<any>(null);
    const [activeTeleponan, setActiveTeleponan] = useState(false);
    const [outgoingCallTarget, setOutgoingCallTarget] = useState<string | null>(null);

    // Recording States
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<any>(null);

    // Sync Ref dengan State PIN
    useEffect(() => { pinRef.current = accessPin; }, [accessPin]);

    // --- 1. INITIALIZATION & URL PARSING ---
    useEffect(() => {
        // Cek URL params untuk auto-join (Deep Linking Logic)
        const params = new URLSearchParams(window.location.search);
        const connectId = params.get('connect');
        const key = params.get('key');

        if (connectId && key) {
            console.log("[ISTOK_AUTO] Link undangan terdeteksi!");
            // Bersihkan URL tanpa refresh halaman
            window.history.replaceState({}, '', window.location.pathname);
            
            setTargetPeerId(connectId);
            setAccessPin(key);
            setMode('JOIN'); // Pindah UI ke Join
            
            // Simpan di antrean, tunggu Peer Ready
            setPendingJoin({ id: connectId, pin: key });
        }

        initPeer();

        return () => {
            if (peerRef.current) peerRef.current.destroy();
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        };
    }, []);

    // Scroll to bottom
    useEffect(() => {
        msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // --- 2. PEER SETUP ---
    const initPeer = async () => {
        if (peerRef.current) return;

        const iceServers = await getIceServers();
        const peer = new Peer(myProfile.id, {
            config: { iceServers },
            debug: 1 // Errors only
        });

        peer.on('open', (id) => {
            console.log("[ISTOK_NET] Peer Ready:", id);
            setErrorMsg('');
            
            // EXECUTE PENDING JOIN (Logic Baru)
            if (pendingJoin) {
                console.log("[ISTOK_AUTO] Mengeksekusi Pending Join...");
                joinSession(pendingJoin.id, pendingJoin.pin);
                setPendingJoin(null);
            }
        });

        peer.on('connection', (conn) => {
            handleIncomingConnection(conn);
        });

        peer.on('call', (call) => {
            console.log("[ISTOK_NET] Incoming Call...", call.peer);
            playSound('CALL_RING');
            setIncomingMediaCall(call);
        });

        peer.on('error', (err) => {
            console.error("[ISTOK_ERR]", err);
            if (err.type === 'peer-unavailable') {
                setErrorMsg("Target Peer Offline / ID Salah.");
                setStage('IDLE');
            } else if (err.type === 'disconnected') {
                console.warn("Peer disconnected. Reconnecting...");
                peer.reconnect();
            } else {
                setErrorMsg(`Network Error: ${err.type}`);
            }
        });

        peerRef.current = peer;
    };

    // --- 3. CONNECTION LOGIC (Refactored) ---
    const joinSession = (id: string, pin: string) => {
        if (!id || !pin) { setErrorMsg("ID dan PIN wajib diisi."); return; }

        // Logic Antrean jika Peer belum siap
        if (!peerRef.current || peerRef.current.disconnected) {
            console.warn("[ISTOK_NET] Peer not ready, queueing join...");
            setPendingJoin({ id, pin });
            if (peerRef.current) peerRef.current.reconnect();
            return;
        }

        if (connRef.current) connRef.current.close();

        setStage('LOCATING_PEER');
        setTargetPeerId(id);
        setAccessPin(pin);
        setErrorMsg('');

        console.log(`[ISTOK_NET] Connecting to ${id}...`);

        const conn = peerRef.current.connect(id, {
            reliable: true,
            serialization: 'json'
        });

        // Safety Timeout
        const timeout = setTimeout(() => {
            if (stage === 'LOCATING_PEER') {
                conn.close();
                setErrorMsg("Koneksi Timeout. Peer mungkin offline.");
                setStage('IDLE');
            }
        }, 8000);

        conn.on('open', () => {
            clearTimeout(timeout);
            console.log("[ISTOK_NET] Tunnel Open. Handshaking...");
            connRef.current = conn;
            setStage('HANDSHAKE_INIT');
            
            // Start Handshake
            initiateHandshake(conn, pin);
        });

        conn.on('data', (data: any) => handleData(data, conn));
        conn.on('close', () => handleDisconnect());
        conn.on('error', (err: any) => {
            clearTimeout(timeout);
            console.error("Conn Error", err);
            setErrorMsg("Gagal terhubung.");
            setStage('IDLE');
        });
    };

    const initiateHandshake = async (conn: any, pin: string) => {
        setStage('VERIFYING_KEYS');
        const payload = JSON.stringify({ type: 'CONNECTION_REQUEST', identity: myProfile.username });
        const encrypted = await encryptData(payload, pin);
        
        if (encrypted) {
            conn.send({ type: 'REQ', payload: encrypted });
        } else {
            setErrorMsg("Enkripsi Gagal.");
            conn.close();
        }
    };

    const handleIncomingConnection = (conn: any) => {
        console.log("[ISTOK_NET] Incoming Connection:", conn.peer);
        conn.on('data', (data: any) => handleData(data, conn));
        conn.on('close', () => handleDisconnect());
    };

    // --- 4. DATA HANDLING ---
    const handleData = async (data: any, conn: any) => {
        const currentPin = pinRef.current;

        // CHUNKING (Assembly)
        if (data.type === 'CHUNK') {
            const { msgId, index, total, data: chunkData } = data;
            if (!chunkBuffer.current[msgId]) chunkBuffer.current[msgId] = { chunks: new Array(total), count: 0, total };
            const buffer = chunkBuffer.current[msgId];
            if (!buffer.chunks[index]) {
                buffer.chunks[index] = chunkData;
                buffer.count++;
            }
            if (buffer.count === buffer.total) {
                const fullPayload = buffer.chunks.join('');
                delete chunkBuffer.current[msgId];
                handleData({ type: 'MSG', payload: fullPayload }, conn);
            }
            return;
        }

        // PROTOCOLS
        if (data.type === 'REQ') {
            const json = await decryptData(data.payload, currentPin);
            if (json) {
                const req = JSON.parse(json);
                if (req.type === 'CONNECTION_REQUEST') {
                    setIncomingRequest({ peerId: conn.peer, identity: req.identity, conn });
                    playSound('MSG_IN');
                }
            } else {
                console.warn("Decrypt failed. Wrong PIN.");
                conn.send({ type: 'AUTH_FAIL' }); // Beritahu pengirim
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
                    playSound('CONNECT');
                    startHeartbeat();
                    // Save Session
                    saveSession(conn.peer, res.identity, currentPin);
                }
            }
        }
        else if (data.type === 'AUTH_FAIL') {
            setErrorMsg("PIN SALAH. Akses ditolak.");
            setStage('IDLE');
            conn.close();
        }
        else if (data.type === 'MSG') {
            const json = await decryptData(data.payload, currentPin);
            if (json) {
                const msg = JSON.parse(json);
                msg.sender = 'THEM';
                setMessages(prev => [...prev, msg]);
                playSound('MSG_IN');
            }
        }
        else if (data.type === 'PING') { conn.send({ type: 'PONG' }); }
        else if (data.type === 'PONG') { /* Alive */ }
        else if (data.type === 'CALL_SIGNAL') { /* Pre-call wake up */ }
    };

    const saveSession = (id: string, name: string, pin: string) => {
        const now = Date.now();
        setSessions(prev => {
            if (prev.find(s => s.id === id)) return prev.map(s => s.id === id ? {...s, lastSeen: now, status: 'ONLINE', name} : s);
            return [...prev, { id, name, lastSeen: now, status: 'ONLINE', pin, createdAt: now }];
        });
    };

    const acceptRequest = async () => {
        if (!incomingRequest) return;
        setIsHandshaking(true);
        
        const currentPin = pinRef.current;
        const payload = JSON.stringify({ type: 'CONNECTION_ACCEPT', identity: myProfile.username });
        const encrypted = await encryptData(payload, currentPin);
        
        if (encrypted && incomingRequest.conn) {
            incomingRequest.conn.send({ type: 'RESP', payload: encrypted });
            
            connRef.current = incomingRequest.conn;
            setTargetPeerId(incomingRequest.peerId);
            setMode('CHAT');
            setStage('SECURE');
            setIsPeerOnline(true);
            startHeartbeat();
            saveSession(incomingRequest.peerId, incomingRequest.identity, currentPin);
            setIncomingRequest(null);
        }
        setIsHandshaking(false);
    };

    const startHeartbeat = () => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
            if (connRef.current && connRef.current.open) {
                connRef.current.send({ type: 'PING' });
            }
        }, HEARTBEAT_INTERVAL);
    };

    const handleDisconnect = () => {
        setIsPeerOnline(false);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        if (mode === 'CHAT') {
            // Jangan langsung error, beri indikasi reconnecting visual
        }
    };

    // --- 5. MESSAGING & MEDIA ---
    const sendMessage = async (type: string, content: string, extra: any = {}) => {
        if (!connRef.current) return;
        
        const msg: Message = {
            id: uuidv4(),
            sender: 'ME',
            type: type as any,
            content,
            timestamp: Date.now(),
            status: 'PENDING',
            ...extra
        };

        setMessages(prev => [...prev, msg]);

        const payload = JSON.stringify(msg);
        const encrypted = await encryptData(payload, pinRef.current);

        if (encrypted) {
            if (encrypted.length > CHUNK_SIZE) {
                // Chunking
                const chunks = [];
                for(let i=0; i<encrypted.length; i+=CHUNK_SIZE) chunks.push(encrypted.slice(i, i+CHUNK_SIZE));
                chunks.forEach((chunk, idx) => {
                    connRef.current.send({ type: 'CHUNK', msgId: msg.id, index: idx, total: chunks.length, data: chunk });
                });
            } else {
                connRef.current.send({ type: 'MSG', payload: encrypted });
            }
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'SENT' } : m));
            playSound('MSG_OUT');
        }
    };

    // Recording Logic
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = getSupportedMimeType() || 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            recorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            recordingIntervalRef.current = setInterval(() => setRecordingTime(p => p+1), 1000);
        } catch (e) { alert("Mic Error"); }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    sendMessage('AUDIO', base64, { duration: recordingTime, size: blob.size, mimeType: mediaRecorderRef.current?.mimeType });
                };
                reader.readAsDataURL(blob);
                mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingIntervalRef.current);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type.startsWith('image/')) {
            const { base64, size, mimeType } = await compressImage(file);
            sendMessage('IMAGE', base64, { size, mimeType });
        } else {
            const reader = new FileReader();
            reader.onload = () => sendMessage('FILE', (reader.result as string).split(',')[1], { fileName: file.name, size: file.size });
            reader.readAsDataURL(file);
        }
        e.target.value = ''; // Reset input
    };

    // --- RENDER ---
    
    // 1. Calling View
    if (activeTeleponan) {
        return <TeleponanView onClose={()=>setActiveTeleponan(false)} existingPeer={peerRef.current} initialTargetId={outgoingCallTarget || undefined} incomingCall={incomingMediaCall} />;
    }

    // 2. Main View
    return (
        <div className="h-[100dvh] w-full bg-[#050505] flex flex-col font-sans relative overflow-hidden">
            {/* GLOBAL OVERLAYS */}
            {incomingMediaCall && (
                <CallNotification 
                    identity={incomingMediaCall.peer} 
                    onAnswer={()=>{setIncomingMediaCall(null); setActiveTeleponan(true);}} 
                    onDecline={()=>{incomingMediaCall.close(); setIncomingMediaCall(null);}} 
                />
            )}

            {incomingRequest && (
                <ConnectionNotification 
                    identity={incomingRequest.identity} 
                    peerId={incomingRequest.peerId} 
                    onAccept={acceptRequest} 
                    onDecline={() => setIncomingRequest(null)}
                    isProcessing={isHandshaking}
                />
            )}

            {viewImage && (
                <div className="fixed inset-0 z-[10000] bg-black flex items-center justify-center p-4">
                    <button onClick={()=>setViewImage(null)} className="absolute top-6 right-6 p-3 bg-white/20 rounded-full text-white"><X/></button>
                    <img src={viewImage} className="max-w-full max-h-full rounded-lg" />
                </div>
            )}

            {showWalkieTalkie && (
                 <IStokWalkieTalkie 
                    onClose={() => setShowWalkieTalkie(false)} 
                    onSendAudio={(b64, dur, size) => sendMessage('AUDIO', b64, { duration: dur, size, mimeType: 'audio/webm' })}
                    latestMessage={null}
                 />
            )}

            {/* SIDEBAR */}
            <SidebarIStokContact 
                isOpen={showContactSidebar}
                onClose={() => setShowContactSidebar(false)}
                sessions={sessions}
                profile={myProfile}
                onSelect={(s) => { setTargetPeerId(s.id); setAccessPin(s.pin); joinSession(s.id, s.pin); setShowContactSidebar(false); }}
                onCallContact={(c) => { 
                    const s = sessions.find(sess => sess.id === c.id);
                    if(s) { setTargetPeerId(s.id); setAccessPin(s.pin); joinSession(s.id, s.pin); setShowContactSidebar(false); }
                }}
                onRenameSession={()=>{}} onDeleteSession={()=>{}} onRegenerateProfile={()=>{}} currentPeerId={null}
            />

            {/* MODE: CHAT */}
            {mode === 'CHAT' ? (
                <>
                    <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#09090b]/80 backdrop-blur-md pt-[calc(env(safe-area-inset-top)+1rem)]">
                        <div className="flex items-center gap-3">
                            <button onClick={()=>{setMode('SELECT'); if(connRef.current) connRef.current.close();}} className="text-neutral-400 hover:text-white"><ArrowLeft size={20}/></button>
                            <div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${isPeerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                                    <h3 className="text-white font-bold text-sm truncate max-w-[150px]">{sessions.find(s=>s.id===targetPeerId)?.name || targetPeerId}</h3>
                                </div>
                                <p className="text-[9px] text-neutral-500 font-mono mt-0.5">{isPeerOnline ? 'SECURE_CHANNEL_ACTIVE' : 'OFFLINE'}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {isPeerOnline && <button onClick={()=>{connRef.current.send({type:'CALL_SIGNAL'}); setOutgoingCallTarget(targetPeerId); setActiveTeleponan(true);}} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-full"><Phone size={18}/></button>}
                            <button onClick={()=>setMessages([])} className="p-2 text-neutral-500 hover:text-red-500"><Skull size={18}/></button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scroll">
                        {messages.map(msg => (
                            <MessageBubble key={msg.id} msg={msg} setViewImage={setViewImage} />
                        ))}
                        <div ref={msgEndRef} />
                        {!isPeerOnline && (
                            <div className="flex justify-center py-4"><span className="bg-red-500/10 text-red-500 text-[10px] px-3 py-1 rounded-full flex gap-2 items-center font-bold"><WifiOff size={12}/> RECONNECTING...</span></div>
                        )}
                    </div>

                    <IStokInput 
                        onSend={(t:string)=>sendMessage('TEXT', t)} 
                        onTyping={()=>{}} 
                        disabled={!isPeerOnline}
                        isRecording={isRecording} recordingTime={recordingTime}
                        onStartRecord={startRecording} onStopRecord={stopRecording}
                        onAttach={()=>fileInputRef.current?.click()} onTogglePTT={()=>setShowWalkieTalkie(true)}
                    />
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                </>
            ) : (
                /* MODE: SETUP (HOST/JOIN) */
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    {mode === 'SELECT' && (
                        <div className="space-y-6 w-full max-w-sm">
                            <h1 className="text-4xl font-black text-white italic tracking-tighter">IStoic <span className="text-emerald-500">NET</span></h1>
                            <div className="grid gap-4">
                                <button onClick={()=>{setAccessPin(Math.floor(100000+Math.random()*900000).toString()); setMode('HOST');}} className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition group">
                                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500"><Server size={24}/></div>
                                    <div className="text-left"><div className="text-white font-bold">HOST SESSION</div><p className="text-[10px] text-neutral-500">Create Secure Room</p></div>
                                </button>
                                <button onClick={()=>setMode('JOIN')} className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition group">
                                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><ScanLine size={24}/></div>
                                    <div className="text-left"><div className="text-white font-bold">JOIN SESSION</div><p className="text-[10px] text-neutral-500">Connect via ID / QR</p></div>
                                </button>
                                <button onClick={()=>setShowContactSidebar(true)} className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition group">
                                    <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500"><Users size={24}/></div>
                                    <div className="text-left"><div className="text-white font-bold">CONTACTS</div><p className="text-[10px] text-neutral-500">Saved Peers</p></div>
                                </button>
                            </div>
                        </div>
                    )}

                    {mode === 'HOST' && (
                        <div className="w-full max-w-sm space-y-6 animate-fade-in relative">
                            <button onClick={()=>setMode('SELECT')} className="absolute -top-12 left-0 text-neutral-500 flex items-center gap-2"><ArrowLeft size={16}/> BACK</button>
                            <div className="bg-[#09090b] border border-white/10 p-8 rounded-[32px] space-y-6">
                                <Server className="text-emerald-500 mx-auto" size={40}/>
                                <div>
                                    <p className="text-[9px] text-neutral-500 mb-1 font-mono">SIGNAL ID</p>
                                    <code className="bg-black border border-white/10 p-3 rounded-lg text-emerald-500 block text-xs select-all break-all">{myProfile.id}</code>
                                </div>
                                <div>
                                    <p className="text-[9px] text-neutral-500 mb-1 font-mono">SECURE PIN</p>
                                    <div className="text-3xl font-black text-white tracking-[0.5em]">{accessPin}</div>
                                </div>
                                <button onClick={()=>setShowShare(true)} className="w-full py-3 bg-white/10 rounded-xl text-white font-bold text-xs hover:bg-white/20">SHOW QR CODE</button>
                            </div>
                            {showShare && <ShareConnection peerId={myProfile.id} pin={accessPin} onClose={()=>setShowShare(false)} />}
                        </div>
                    )}

                    {mode === 'JOIN' && (
                        <IStokAuth 
                            identity={myProfile.username}
                            onRegenerateIdentity={()=>{}}
                            onHost={()=>{}}
                            onJoin={(id, pin) => joinSession(id, pin)}
                            errorMsg={errorMsg}
                            onErrorClear={()=>setErrorMsg('')}
                            isRelayActive={false}
                            forcedMode="JOIN"
                            connectionStage={stage}
                        />
                    )}
                    
                    {/* Tombol Back untuk JOIN mode handled inside IStokAuth or via global abort */}
                    {mode === 'JOIN' && <button onClick={()=>{setMode('SELECT'); setStage('IDLE');}} className="fixed top-6 left-6 text-neutral-500 text-xs font-bold z-50">ABORT</button>}
                </div>
            )}
        </div>
    );
};