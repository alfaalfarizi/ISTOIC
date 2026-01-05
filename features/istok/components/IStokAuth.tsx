
import React, { useState, useEffect, useRef } from 'react';
import { 
    Server, ScanLine, RefreshCw, 
    Fingerprint, Activity, ArrowRight, ShieldCheck,
    QrCode, Clipboard, Camera, X, Check, Loader2, Wifi, Zap, Lock
} from 'lucide-react';

interface IStokAuthProps {
    identity: string;
    onRegenerateIdentity: () => void;
    onHost: () => void;
    onJoin: (targetId: string, pin: string) => void;
    errorMsg?: string;
    onErrorClear: () => void;
    isRelayActive: boolean;
    forcedMode?: 'DEFAULT' | 'JOIN';
    connectionStage?: string; // Menangkap stage dari parent
}

export const IStokAuth: React.FC<IStokAuthProps> = ({ 
    identity, 
    onRegenerateIdentity, 
    onHost, 
    onJoin,
    errorMsg,
    onErrorClear,
    isRelayActive,
    forcedMode = 'DEFAULT',
    connectionStage = 'IDLE'
}) => {
    const [targetId, setTargetId] = useState('');
    const [pin, setPin] = useState('');
    const [isJoining, setIsJoining] = useState(forcedMode === 'JOIN');
    const [isScanning, setIsScanning] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<any>(null);

    const [glitchedIdentity, setGlitchedIdentity] = useState(identity);

    useEffect(() => {
        if (forcedMode === 'DEFAULT') {
            let iteration = 0;
            const original = identity;
            const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            const interval = setInterval(() => {
                setGlitchedIdentity(original.split("").map((l, i) => i < iteration ? original[i] : letters[Math.floor(Math.random() * 26)]).join(""));
                if (iteration >= original.length) clearInterval(interval);
                iteration += 1 / 3;
            }, 30);
            return () => clearInterval(interval);
        } else {
            setGlitchedIdentity(identity);
        }
    }, [identity, forcedMode]);

    // Handle Join Submit (Manual)
    const handleJoinSubmit = () => {
        if (!targetId || pin.length < 4) return;
        if (navigator.vibrate) navigator.vibrate(20);
        onJoin(targetId, pin);
    };

    // --- PASTE HANDLER ---
    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setTargetId(text.trim());
                if (navigator.vibrate) navigator.vibrate(10);
            }
        } catch (err) {
            const input = document.getElementById('target-id-input') as HTMLInputElement;
            input?.focus();
            document.execCommand('paste');
        }
    };

    // --- QR SCANNER LOGIC ---
    const startScanner = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            streamRef.current = stream;
            setIsScanning(true);
            
            // Polling scanner (Robust for all devices)
            if ('BarcodeDetector' in window) {
                const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
                scanIntervalRef.current = setInterval(async () => {
                    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                        try {
                            const barcodes = await detector.detect(videoRef.current);
                            if (barcodes.length > 0) {
                                processScannedData(barcodes[0].rawValue);
                            }
                        } catch (e) {}
                    }
                }, 400);
            } else {
                // Fallback: visual check loop (simulated detect if no API)
                // In production, you'd use a library like jsQR here.
                console.warn("BarcodeDetector not supported. Add jsQR for fallback.");
            }
        } catch (err) {
            alert("Kamera tidak dapat diakses.");
        }
    };

    const stopScanner = () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        setIsScanning(false);
    };

    const processScannedData = (data: string) => {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Success feedback
        
        let extractedId = data;
        let extractedPin = '';

        try {
            // Check for IStok URL format: /#connect=ID&key=PIN
            if (data.includes('connect=')) {
                const urlPart = data.split('#')[1] || data.split('?')[1];
                const params = new URLSearchParams(urlPart);
                extractedId = params.get('connect') || extractedId;
                extractedPin = params.get('key') || '';
            }
        } catch (e) {}
        
        setTargetId(extractedId);
        if (extractedPin) setPin(extractedPin);
        
        stopScanner();
        
        // Auto-connect if data is complete
        if (extractedId && extractedPin.length >= 4) {
            onJoin(extractedId, extractedPin);
        }
    };

    useEffect(() => {
        if (isScanning && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [isScanning]);

    // --- VIEW: LOADING / CONNECTING OVERLAY ---
    if (connectionStage !== 'IDLE' && connectionStage !== 'SECURE' && forcedMode === 'JOIN') {
        return (
            <div className="w-full max-w-md mx-auto p-10 flex flex-col items-center justify-center animate-fade-in text-center space-y-8">
                <div className="relative">
                    <div className="w-32 h-32 rounded-[40px] border-4 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Wifi size={32} className="text-blue-500 animate-pulse" />
                    </div>
                    {/* Signal Rings */}
                    <div className="absolute inset-0 rounded-full border border-blue-500/30 animate-ping opacity-20"></div>
                </div>
                
                <div className="space-y-2">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Establishing Link...</h3>
                    <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-blue-400 uppercase tracking-widest">
                        <Activity size={12} /> STATUS: {connectionStage.replace(/_/g, ' ')}
                    </div>
                </div>

                <div className="w-full bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="text-[10px] text-neutral-500 font-mono leading-relaxed">
                        TARGET: <span className="text-white">{targetId.slice(0, 16)}...</span><br/>
                        PROTOCOL: AES-256-P2P_UPLINK
                    </p>
                </div>

                <button onClick={onErrorClear} className="text-[10px] font-black text-neutral-600 hover:text-white uppercase tracking-widest">ABORT CONNECTION</button>
            </div>
        );
    }

    // --- VIEW: SCANNER ---
    if (isScanning) {
        return (
            <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-fade-in">
                <div className="flex-1 relative overflow-hidden">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute inset-0 border-[40px] border-black/60 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 border-2 border-blue-500 rounded-[32px] pointer-events-none shadow-[0_0_100px_rgba(59,130,246,0.2)]">
                         <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                         <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                         <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                         <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                         <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-blue-400/50 shadow-[0_0_15px_#3b82f6] animate-[scan_2s_linear_infinite]"></div>
                    </div>
                    <div className="absolute top-14 w-full text-center">
                        <span className="bg-blue-600 text-white px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">Arahkan ke Kode QR</span>
                    </div>
                </div>
                <div className="p-8 bg-[#050505] flex justify-center pb-[max(env(safe-area-inset-bottom),2rem)]">
                    <button onClick={stopScanner} className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/20 active:scale-90 transition-all"><X size={32} /></button>
                </div>
                <style>{` @keyframes scan { 0% { top: 10%; opacity: 0; } 50% { opacity: 1; } 100% { top: 90%; opacity: 0; } } `}</style>
            </div>
        );
    }

    // --- VIEW: CLEAN JOIN FORM ---
    if (forcedMode === 'JOIN') {
        return (
            <div className="w-full max-w-md mx-auto p-6 animate-slide-up flex flex-col gap-8">
                <div className="text-center space-y-3">
                    <div className="w-20 h-20 bg-blue-600/10 text-blue-500 rounded-[32px] flex items-center justify-center mx-auto border border-blue-500/20 shadow-[0_0_40px_rgba(59,130,246,0.15)]">
                        <ScanLine size={40} />
                    </div>
                    <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">P2P Uplink</h2>
                    <p className="text-neutral-500 text-xs font-medium uppercase tracking-widest">Siap Menghubungkan Sesi Terenkripsi</p>
                </div>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-1">Target ID</label>
                        <div className="relative flex items-center group">
                            <input 
                                id="target-id-input"
                                value={targetId}
                                onChange={(e) => {setTargetId(e.target.value); if(errorMsg) onErrorClear();}}
                                placeholder="PASTE_ID_HERE..." 
                                className="w-full bg-[#0a0a0b] border border-white/10 rounded-2xl px-6 py-5 text-sm font-mono text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-neutral-800"
                                autoFocus
                            />
                            <button onClick={handlePaste} className="absolute right-4 p-2.5 text-neutral-500 hover:text-white bg-white/5 rounded-xl hover:bg-white/10 transition-all active:scale-90"><Clipboard size={18} /></button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-1">Access Key</label>
                        <input 
                            value={pin}
                            onChange={(e) => {setPin(e.target.value); if(errorMsg) onErrorClear();}}
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="6_DIGIT_PIN" 
                            className="w-full bg-[#0a0a0b] border border-white/10 rounded-2xl px-6 py-5 text-lg font-mono text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-neutral-800 text-center tracking-[0.6em]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <button onClick={startScanner} className="h-16 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-sm">
                            <Camera size={20} /> SCAN_QR
                        </button>
                        <button 
                            onClick={handleJoinSubmit}
                            disabled={!targetId || pin.length < 4}
                            className="h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
                        >
                            CONNECT_NOW <ArrowRight size={18} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {errorMsg && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4 text-red-500 text-xs font-bold animate-shake uppercase tracking-tighter">
                        <ShieldCheck size={20} />
                        <span className="flex-1">{errorMsg}</span>
                        <button onClick={onErrorClear} className="p-1.5 hover:bg-red-500/20 rounded-lg"><X size={16}/></button>
                    </div>
                )}
            </div>
        );
    }

    // --- DEFAULT DASHBOARD (Host/Join Selector) ---
    return (
        <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto space-y-12 z-10 p-6">
            <div className="text-center space-y-6 animate-slide-down">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">
                    <ShieldCheck size={12}/> TITANIUM RELAY PROTOCOL v0.55
                </div>
                <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-white uppercase drop-shadow-2xl leading-none">
                    SECURE <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 animate-gradient-text">UPLINK</span>
                </h1>
                <p className="text-neutral-500 font-mono text-xs max-w-md mx-auto leading-relaxed uppercase tracking-widest">
                    AES-256 + FORCE TURN + HYDRA-LINK HANDOVER. <br/>
                    {isRelayActive ? (
                        <span className="text-purple-400 flex items-center justify-center gap-2 mt-2 font-black">
                            <Activity size={10} className="animate-pulse"/> RELAY NODE ACTIVE
                        </span>
                    ) : (
                        <span className="text-neutral-600 block mt-2">DIRECT P2P ONLY</span>
                    )}
                </p>
            </div>

            <div className="w-full max-w-md relative group animate-slide-up">
                <div className="bg-[#0a0a0b] border border-white/10 rounded-[40px] p-8 relative overflow-hidden ring-1 ring-white/5">
                    <div className="flex items-center justify-between relative z-10 mb-6">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                            <Fingerprint size={14} /> My_Identity
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
                            <span className="text-[9px] font-black text-emerald-500 tracking-widest uppercase">Masked</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-4xl md:text-5xl font-black text-white font-mono tracking-tighter tabular-nums truncate pr-4">
                                {glitchedIdentity}
                            </h2>
                        </div>
                        <button onClick={onRegenerateIdentity} className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all active:scale-90 border border-white/5 shrink-0 group/btn">
                            <RefreshCw size={24} className="group-hover/btn:rotate-180 transition-transform duration-700" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-4xl z-10 animate-slide-up grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                <button onClick={onHost} className="group relative p-10 rounded-[48px] bg-zinc-900/50 border border-white/10 hover:border-emerald-500/50 transition-all duration-500 hover:bg-zinc-900 flex flex-col items-start gap-8 text-left ring-1 ring-transparent hover:ring-emerald-500/20 active:scale-[0.98]">
                    <div className="w-16 h-16 rounded-[24px] bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                        <Server size={32} />
                    </div>
                    <div>
                        <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-2 group-hover:text-emerald-400 transition-colors leading-none">Host Mode</h3>
                        <p className="text-[10px] text-neutral-500 font-bold leading-relaxed font-mono uppercase tracking-widest">Create a secure frequency. You become the uplink anchor.</p>
                    </div>
                    <div className="mt-auto flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0">
                        INITIALIZE_CORE <ArrowRight size={14} strokeWidth={3} />
                    </div>
                </button>

                <button onClick={() => setIsJoining(true)} className="group relative p-10 rounded-[48px] bg-zinc-900/50 border border-white/10 hover:border-blue-500/50 transition-all duration-500 hover:bg-zinc-900 flex flex-col items-start gap-8 text-left ring-1 ring-transparent hover:ring-blue-500/20 active:scale-[0.98]">
                    <div className="w-16 h-16 rounded-[24px] bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform border border-blue-500/20 shadow-[0_0_40px_rgba(59,130,246,0.1)]">
                        <ScanLine size={32} />
                    </div>
                    <div>
                        <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-2 group-hover:text-blue-400 transition-colors leading-none">Join Mode</h3>
                        <p className="text-[10px] text-neutral-500 font-bold leading-relaxed font-mono uppercase tracking-widest">Scan or enter ID to link with an existing anomaly.</p>
                    </div>
                    <div className="mt-auto flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0">
                        OPEN_SCANNER <ArrowRight size={14} strokeWidth={3} />
                    </div>
                </button>
            </div>
            
            {isJoining && (
                <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
                    <div className="relative w-full max-w-md bg-[#050505] rounded-[48px] shadow-2xl border border-white/10 py-4">
                        <button onClick={() => setIsJoining(false)} className="absolute top-8 right-8 z-50 p-2 text-neutral-500 hover:text-white bg-white/5 rounded-full"><X size={24}/></button>
                        <IStokAuth identity={identity} onRegenerateIdentity={onRegenerateIdentity} onHost={onHost} onJoin={onJoin} errorMsg={errorMsg} onErrorClear={onErrorClear} isRelayActive={isRelayActive} forcedMode="JOIN" connectionStage={connectionStage} />
                    </div>
                </div>
            )}
        </div>
    );
};
