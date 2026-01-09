
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { encodeAudio, decodeAudio, decodeAudioData, noteTools, visualTools, KEY_MANAGER } from "./geminiService";
import { debugService } from "./debugService";

export type NeuralLinkStatus = 'IDLE' | 'CONNECTING' | 'ACTIVE' | 'ERROR';
export type MicMode = 'STANDARD' | 'ISOLATION' | 'HIGH_FIDELITY';
export type AmbientMode = 'OFF' | 'CYBER' | 'RAIN' | 'CAFE';

export interface TranscriptionEvent {
    text: string;
    source: 'user' | 'model';
    isFinal: boolean;
}

export interface NeuralLinkConfig {
    modelId: string;
    persona: 'hanisah' | 'stoic';
    systemInstruction: string;
    voiceName: string;
    onStatusChange: (status: NeuralLinkStatus, error?: string) => void;
    onToolCall: (toolCall: any) => Promise<any>;
    onTranscription?: (event: TranscriptionEvent) => void;
}

// Allowed Gemini Live Voices
const GOOGLE_VALID_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Zephyr'];

/**
 * PROCEDURAL AMBIENT ENGINE
 */
class AmbientMixer {
    private ctx: AudioContext;
    private activeNodes: AudioNode[] = [];
    private gainNode: GainNode;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 0.15; // Default low volume
        this.gainNode.connect(ctx.destination);
    }

    setMode(mode: AmbientMode) {
        this.stop();
        if (mode === 'OFF') return;

        const t = this.ctx.currentTime;

        if (mode === 'CYBER') {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(50, t);
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(200, t);
            
            const lfo = this.ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.2; 
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = 100;

            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);
            
            osc.connect(filter);
            filter.connect(this.gainNode);
            
            osc.start();
            lfo.start();
            this.activeNodes.push(osc, lfo, filter, lfoGain);
        } 
        else if (mode === 'RAIN') {
            const bufferSize = 2 * this.ctx.sampleRate;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            const whiteNoise = this.ctx.createBufferSource();
            whiteNoise.buffer = buffer;
            whiteNoise.loop = true;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;

            whiteNoise.connect(filter);
            filter.connect(this.gainNode);
            
            whiteNoise.start();
            this.activeNodes.push(whiteNoise, filter);
        }
    }

    setVolume(val: number) {
        this.gainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }

    stop() {
        this.activeNodes.forEach(node => {
            try { (node as any).stop && (node as any).stop(); } catch(e){}
            try { node.disconnect(); } catch(e){}
        });
        this.activeNodes = [];
    }
}

export class NeuralLinkService {
    private session: any = null;
    private inputCtx: AudioContext | null = null;
    private outputCtx: AudioContext | null = null;
    private nextStartTime: number = 0;
    private sources: Set<AudioBufferSourceNode> = new Set();
    private activeStream: MediaStream | null = null;
    private scriptProcessor: ScriptProcessorNode | null = null;
    private config: NeuralLinkConfig | null = null;
    private _analyser: AnalyserNode | null = null;
    private isConnecting: boolean = false;
    private isConnected: boolean = false;
    private audioCheckInterval: any = null;
    
    // Modules
    private ambientMixer: AmbientMixer | null = null;
    private currentMicMode: MicMode = 'STANDARD';

    constructor() {}

    get analyser() {
        return this._analyser;
    }

    async connect(config: NeuralLinkConfig) {
        if (this.isConnecting || this.isConnected) {
            console.warn("Neural Link already active or connecting.");
            return;
        }
        
        this.isConnecting = true;
        this.config = config;
        
        // Reset state
        this.disconnect(true); 
        config.onStatusChange('CONNECTING');

        try {
            await this.initializeSession(config);
        } catch (e: any) {
            console.error("Setup Failed:", e);
            config.onStatusChange('ERROR', e.name === 'NotAllowedError' ? "Mic Access Denied" : e.message);
            this.disconnect();
        }
    }

    private async initializeSession(config: NeuralLinkConfig) {
        // 1. Initialize Audio Contexts if not present
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        
        if (!this.inputCtx || this.inputCtx.state === 'closed') {
            this.inputCtx = new AudioContextClass({ sampleRate: 16000 });
        }
        
        if (!this.outputCtx || this.outputCtx.state === 'closed') {
            this.outputCtx = new AudioContextClass({ sampleRate: 24000 });
             // Analyser for visualizer
            this._analyser = this.outputCtx.createAnalyser();
            this._analyser.fftSize = 512;
            this._analyser.smoothingTimeConstant = 0.7;
            this.ambientMixer = new AmbientMixer(this.outputCtx);
        }

        // CRITICAL: Resume contexts immediately
        if (this.inputCtx.state === 'suspended') await this.inputCtx.resume();
        if (this.outputCtx.state === 'suspended') await this.outputCtx.resume();

        // 2. Initialize Mic
        if (!this.activeStream) {
            await this.setupMicrophone(this.currentMicMode);
        }

        // 3. Get API Key
        const apiKey = KEY_MANAGER.getKey('GEMINI');
        if (!apiKey) throw new Error("No healthy GEMINI API key available.");

        const ai = new GoogleGenAI({ apiKey });
        
        // 4. Voice Selection
        if (!GOOGLE_VALID_VOICES.includes(config.voiceName)) {
            config.voiceName = config.persona === 'hanisah' ? 'Kore' : 'Fenrir';
        }

        // 5. Prepare Tools
        const liveTools = [
            { 
                functionDeclarations: [
                    ...(noteTools.functionDeclarations || []),
                    ...(visualTools?.functionDeclarations || [])
                ] 
            }
        ];

        // 6. Connect to Gemini Live
        const sessionPromise = ai.live.connect({
            model: config.modelId || 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    this.isConnecting = false;
                    this.isConnected = true;
                    config.onStatusChange('ACTIVE');
                    
                    this.startAudioInputStream(sessionPromise);
                    
                    this.audioCheckInterval = setInterval(() => {
                        if (this.outputCtx?.state === 'suspended') this.outputCtx.resume();
                        if (this.inputCtx?.state === 'suspended') this.inputCtx.resume();
                    }, 2000);

                    // Send prime text to establish context
                    sessionPromise.then(session => {
                        try {
                            const greeting = config.persona === 'hanisah' 
                            ? "System online. Hai, aku siap."
                            : "Logic core active. Ready.";
                            session.sendRealtimeInput({ text: greeting });
                        } catch(err) { console.error(err); }
                    });
                },
                onmessage: async (msg: LiveServerMessage) => {
                    await this.handleServerMessage(msg, sessionPromise);
                },
                onerror: (e) => {
                    console.error("Neural Link Error:", e);
                    if (this.isConnected) config.onStatusChange('ERROR', "Neural Connection Unstable");
                },
                onclose: () => {
                    console.log("Neural Link Closed");
                    this.disconnect();
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                tools: liveTools,
                speechConfig: { 
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName } } 
                },
                systemInstruction: config.systemInstruction,
                inputAudioTranscription: {}, 
                outputAudioTranscription: {},
            }
        });

        this.session = await sessionPromise;
    }

    async switchVoice(newVoice: string) {
        if (!this.config || !this.isConnected) return;
        
        debugService.log('INFO', 'NEURAL_LINK', 'VOICE_SWAP', `Switching to ${newVoice}...`);
        
        // Gemini Live doesn't support hot-swapping config mid-session yet.
        // We must perform a fast-reconnect.
        
        // 1. Close current session gracefully (but keep audio context/stream alive)
        try {
            if (this.session && typeof this.session.close === 'function') {
                this.session.close();
            }
        } catch (e) {}

        // 2. Update config
        this.config.voiceName = newVoice;
        
        // 3. Re-initialize (skips mic/context teardown to be fast)
        try {
            await this.initializeSession(this.config);
        } catch (e) {
            console.error("Voice Switch Failed", e);
            this.disconnect();
        }
    }

    async setMicMode(mode: MicMode) {
        if (!this.isConnected || this.currentMicMode === mode) return;
        this.currentMicMode = mode;
        debugService.log('INFO', 'NEURAL_LINK', 'MIC_UPDATE', `Switching to ${mode} mode`);
        await this.setupMicrophone(mode);
        if (this.session && this.inputCtx) {
             const sessionPromise = Promise.resolve(this.session);
             this.startAudioInputStream(sessionPromise);
        }
    }

    setAmbientMode(mode: AmbientMode) {
        if (this.ambientMixer) {
            this.ambientMixer.setMode(mode);
            debugService.log('INFO', 'NEURAL_LINK', 'AMBIENT', `Environment set to ${mode}`);
        }
    }

    private async setupMicrophone(mode: MicMode) {
        if (this.activeStream) {
            this.activeStream.getTracks().forEach(t => t.stop());
        }

        const constraints: MediaTrackConstraints = {
            sampleRate: 16000,
            channelCount: 1,
        };

        if (mode === 'ISOLATION') {
            constraints.echoCancellation = true;
            constraints.noiseSuppression = { ideal: true };
            constraints.autoGainControl = { ideal: true };
        } else if (mode === 'HIGH_FIDELITY') {
            constraints.echoCancellation = false;
            constraints.noiseSuppression = false;
            constraints.autoGainControl = false;
        } else {
            constraints.echoCancellation = true;
            constraints.noiseSuppression = true;
            constraints.autoGainControl = true;
        }

        this.activeStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    }

    private startAudioInputStream(sessionPromise: Promise<any>) {
        if (!this.inputCtx || !this.activeStream) return;
        
        try {
            if (this.scriptProcessor) {
                this.scriptProcessor.disconnect();
                this.scriptProcessor = null;
            }

            const source = this.inputCtx.createMediaStreamSource(this.activeStream);
            this.scriptProcessor = this.inputCtx.createScriptProcessor(4096, 1, 1);
            
            this.scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // VAD Gate
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                if (rms < 0.002) return; 

                const int16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    int16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
                }
                
                const pcmBlob = { 
                    data: encodeAudio(new Uint8Array(int16.buffer)), 
                    mimeType: 'audio/pcm;rate=16000' 
                };
                
                sessionPromise.then(s => { 
                    try { s.sendRealtimeInput({ media: pcmBlob }); } catch (err) {} 
                });
            };
            
            source.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.inputCtx.destination);
        } catch (err) {
            console.error("Input Stream Error:", err);
        }
    }

    private async handleServerMessage(msg: LiveServerMessage, sessionPromise: Promise<any>) {
        if (!this.isConnected) return;

        if (this.config?.onTranscription) {
            if (msg.serverContent?.inputTranscription) {
                this.config.onTranscription({ 
                    text: msg.serverContent.inputTranscription.text, 
                    source: 'user', 
                    isFinal: !!msg.serverContent.turnComplete 
                });
            }
            if (msg.serverContent?.outputTranscription) {
                this.config.onTranscription({ 
                    text: msg.serverContent.outputTranscription.text, 
                    source: 'model', 
                    isFinal: !!msg.serverContent.turnComplete 
                });
            }
        }

        if (msg.toolCall) {
            for (const fc of msg.toolCall.functionCalls) {
                if (this.config?.onToolCall) {
                    try {
                        const result = await this.config.onToolCall(fc);
                        sessionPromise.then(s => s.sendToolResponse({ 
                            functionResponses: [{ id: fc.id, name: fc.name, response: { result: String(result) } }] 
                        }));
                    } catch (err) {
                        sessionPromise.then(s => s.sendToolResponse({
                            functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Error executing tool" } }]
                        }));
                    }
                }
            }
        }

        const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio && this.outputCtx) {
            try {
                // Ensure context is running for playback
                if (this.outputCtx.state === 'suspended') await this.outputCtx.resume();

                const currentTime = this.outputCtx.currentTime;
                if (this.nextStartTime < currentTime) {
                    this.nextStartTime = currentTime + 0.08; // Slight buffer
                }

                const audioBuffer = await decodeAudioData(decodeAudio(base64Audio), this.outputCtx, 24000, 1);
                const source = this.outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                
                if (this._analyser) { 
                    source.connect(this._analyser); 
                    this._analyser.connect(this.outputCtx.destination); 
                } else {
                    source.connect(this.outputCtx.destination);
                }
                
                source.start(this.nextStartTime);
                this.nextStartTime += audioBuffer.duration;
                this.sources.add(source);
                
                source.onended = () => this.sources.delete(source);
            } catch (e) { }
        }

        if (msg.serverContent?.interrupted) {
            this.sources.forEach(s => { try { s.stop(); } catch(e){} });
            this.sources.clear();
            if (this.outputCtx) this.nextStartTime = this.outputCtx.currentTime;
        }
    }

    disconnect(silent: boolean = false) {
        this.isConnected = false;
        this.isConnecting = false;

        if (this.audioCheckInterval) {
            clearInterval(this.audioCheckInterval);
            this.audioCheckInterval = null;
        }
        
        if (this.session) { 
            try { if(typeof this.session.close === 'function') this.session.close(); } catch(e){} 
            this.session = null; 
        }

        if (this.activeStream) { 
            this.activeStream.getTracks().forEach(t => t.stop()); 
            this.activeStream = null; 
        }

        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }

        if (this.ambientMixer) {
            this.ambientMixer.stop();
        }

        // Close contexts to free hardware
        if (this.inputCtx) { try { this.inputCtx.close(); } catch(e){} this.inputCtx = null; }
        if (this.outputCtx) { try { this.outputCtx.close(); } catch(e){} this.outputCtx = null; }

        this.sources.forEach(s => { try { s.stop(); } catch(e){} });
        this.sources.clear();
        this.nextStartTime = 0;
        
        if (!silent && this.config) {
            this.config.onStatusChange('IDLE');
        }
    }
}
