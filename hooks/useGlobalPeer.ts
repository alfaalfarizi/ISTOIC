
import { useState, useEffect, useRef, useCallback } from 'react';
import { IStokUserIdentity } from '../features/istok/services/istokIdentity';
import { debugService } from '../services/debugService';

export const useGlobalPeer = (identity: IStokUserIdentity | null) => {
    const peerRef = useRef<any>(null);
    const [incomingConnection, setIncomingConnection] = useState<any>(null);
    const [status, setStatus] = useState<'INIT' | 'CONNECTING' | 'READY' | 'DISCONNECTED' | 'ERROR'>('INIT');
    const [peerId, setPeerId] = useState<string | null>(null);
    const [isPeerReady, setIsPeerReady] = useState(false); // Legacy boolean for backward compat if needed
    
    // Timers
    const healthCheckInterval = useRef<any>(null);
    const retryTimeout = useRef<any>(null);

    // CLEANUP FUNCTION
    const destroyPeer = () => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        setStatus('DISCONNECTED');
        setIsPeerReady(false);
        setPeerId(null);
        if (healthCheckInterval.current) clearInterval(healthCheckInterval.current);
        if (retryTimeout.current) clearTimeout(retryTimeout.current);
    };

    const initGlobalPeer = useCallback(async () => {
        if (!identity || !identity.istokId) return;

        // Avoid re-init if already healthy
        if (peerRef.current && !peerRef.current.destroyed && !peerRef.current.disconnected) {
            return;
        }
        
        // Prevent double init overlap
        if (status === 'CONNECTING') return;

        setStatus('CONNECTING');
        console.log('[HYDRA] INITIALIZING ENGINE...');

        try {
            const { Peer } = await import('peerjs');
            
            let iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
            ];

            const meteredKey = process.env.VITE_METERED_API_KEY;
            const meteredDomain = process.env.VITE_METERED_DOMAIN || 'istoic.metered.live';

            if (meteredKey) {
                try {
                    const response = await fetch(`https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredKey}`);
                    const ice = await response.json();
                    if (Array.isArray(ice)) {
                        iceServers = [...ice, ...iceServers];
                        console.log("[HYDRA] TURN RELAY: ACTIVATED");
                    }
                } catch (e) {
                    console.warn("[HYDRA] TURN FALLBACK: STANDARD");
                }
            }

            // Create Peer
            const peer = new Peer(identity.istokId, {
                debug: 0,
                config: { 
                    iceServers: iceServers,
                    iceTransportPolicy: 'all',
                    iceCandidatePoolSize: 10
                },
                pingInterval: 5000, 
            } as any);

            // --- EVENTS ---
            
            peer.on('open', (id) => {
                console.log('[HYDRA] ONLINE:', id);
                setStatus('READY');
                setIsPeerReady(true);
                setPeerId(id);
            });

            peer.on('connection', (conn) => {
                debugService.log('INFO', 'GLOBAL', 'INCOMING', `Signal detected from ${conn.peer}`);
                
                // Immediate State Update (Optimistic)
                setIncomingConnection({ 
                    conn, 
                    firstData: null, 
                    status: 'HANDSHAKING' 
                });

                conn.on('data', (data: any) => {
                    if (data.type === 'SYS' || data.type === 'HANDSHAKE_SYN') {
                        setIncomingConnection({ 
                            conn, 
                            firstData: data,
                            status: 'READY' 
                        });
                    }
                });

                conn.on('close', () => setIncomingConnection(null));
                conn.on('error', () => setIncomingConnection(null));
            });

            peer.on('disconnected', () => {
                console.warn('[HYDRA] SIGNAL LOST. ATTEMPTING RECONNECT...');
                setStatus('DISCONNECTED');
                setIsPeerReady(false);
                // Attempt soft reconnect
                peer.reconnect();
            });

            peer.on('close', () => {
                console.error('[HYDRA] PEER DESTROYED.');
                setStatus('DISCONNECTED');
                setIsPeerReady(false);
                setPeerId(null);
                
                // Aggressive Re-Init
                if (retryTimeout.current) clearTimeout(retryTimeout.current);
                retryTimeout.current = setTimeout(() => {
                    console.log("[HYDRA] AUTO-REBOOTING...");
                    initGlobalPeer();
                }, 1500);
            });

            peer.on('error', (err) => {
                console.error("[HYDRA] ERROR:", err);
                // Common error: ID taken (tab duplication). We can't fix that automatically easily without changing ID.
                // But for network errors, we retry.
                if (err.type === 'peer-unavailable' || err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
                    if (retryTimeout.current) clearTimeout(retryTimeout.current);
                    retryTimeout.current = setTimeout(() => {
                        if (!peerRef.current || peerRef.current.destroyed) initGlobalPeer();
                        else peerRef.current.reconnect();
                    }, 3000);
                }
            });

            peerRef.current = peer;

        } catch (e) {
            console.error("[HYDRA] FATAL INIT FAIL", e);
            setStatus('ERROR');
            setTimeout(initGlobalPeer, 5000); 
        }
    }, [identity, status]);

    // Initial Setup
    useEffect(() => {
        if (identity?.istokId) {
            initGlobalPeer();
        }
        return () => destroyPeer();
    }, [identity, initGlobalPeer]);

    // Watchdog / Health Check
    useEffect(() => {
        healthCheckInterval.current = setInterval(() => {
            if (!peerRef.current) return;
            
            if (peerRef.current.disconnected && !peerRef.current.destroyed) {
                console.log("[HYDRA] WATCHDOG: Reconnecting disconnected peer...");
                peerRef.current.reconnect();
            }
            
            if (peerRef.current.destroyed) {
                console.log("[HYDRA] WATCHDOG: Peer destroyed. Rebooting...");
                initGlobalPeer();
            }
        }, 5000); // Check every 5s

        return () => clearInterval(healthCheckInterval.current);
    }, [initGlobalPeer]);

    // Network Recovery (Aggressive)
    useEffect(() => {
        const handleOnline = () => {
            console.log("[HYDRA] NETWORK RESTORED. FORCING REBOOT...");
            // Force destroy and recreate to ensure clean socket state
            if (peerRef.current) peerRef.current.destroy();
            initGlobalPeer();
        };

        window.addEventListener('online', handleOnline);
        // Also listen for visibility change to reconnect when tab becomes active
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && (peerRef.current?.disconnected || peerRef.current?.destroyed)) {
                console.log("[HYDRA] TAB ACTIVE. CHECKING CONNECTION...");
                if (peerRef.current?.disconnected) peerRef.current.reconnect();
                else initGlobalPeer();
            }
        });

        return () => {
            window.removeEventListener('online', handleOnline);
        };
    }, [initGlobalPeer]);

    return {
        peer: peerRef.current,
        isPeerReady: status === 'READY', // Normalized boolean for UI
        status, // Detailed status
        peerId, 
        incomingConnection,
        clearIncoming: () => setIncomingConnection(null),
        forceReconnect: () => {
             console.log("[HYDRA] MANUAL RECONNECT TRIGGERED");
             if (peerRef.current) peerRef.current.destroy();
             initGlobalPeer();
        }
    };
};
