
import { useState, useEffect, useRef, useCallback } from 'react';
import { IStokUserIdentity } from '../features/istok/services/istokIdentity';
import { debugService } from '../services/debugService';

export const useGlobalPeer = (identity: IStokUserIdentity | null) => {
    const peerRef = useRef<any>(null);
    const [incomingConnection, setIncomingConnection] = useState<any>(null);
    const [isPeerReady, setIsPeerReady] = useState(false);

    useEffect(() => {
        if (!identity || !identity.istokId || peerRef.current) return;

        const initGlobalPeer = async () => {
            try {
                const { Peer } = await import('peerjs');
                
                let iceServers = [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ];

                const meteredKey = process.env.VITE_METERED_API_KEY;
                const meteredDomain = process.env.VITE_METERED_DOMAIN || 'istoic.metered.live';

                if (meteredKey) {
                    try {
                        const response = await fetch(`https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredKey}`);
                        const ice = await response.json();
                        if (Array.isArray(ice)) {
                            iceServers = [...ice, ...iceServers];
                            console.log("[GLOBAL] TURN RELAY ACTIVE");
                        }
                    } catch (e) {
                        console.warn("[GLOBAL] TURN Fetch Failed", e);
                    }
                }

                const peer = new Peer(identity.istokId, {
                    debug: 0,
                    config: { 
                        iceServers: iceServers,
                        iceTransportPolicy: 'all',
                        iceCandidatePoolSize: 10
                    },
                    pingInterval: 5000,
                } as any);

                peer.on('open', (id) => {
                    console.log('[GLOBAL] IStok Online:', id);
                    setIsPeerReady(true);
                });

                peer.on('connection', (conn) => {
                    debugService.log('INFO', 'GLOBAL', 'INCOMING', `Connection from ${conn.peer}`);
                    // Capture handshake immediately
                    conn.on('data', (data: any) => {
                        if (data.type === 'SYS') {
                            // Pass to App handler
                            setIncomingConnection({ conn, firstData: data });
                        }
                    });
                });

                peer.on('error', (err) => {
                    console.error("[GLOBAL] Peer Error:", err);
                    if (err.type === 'peer-unavailable' || err.type === 'network') {
                        // Silent retry logic could go here
                    }
                });

                peerRef.current = peer;
            } catch (e) {
                console.error("[GLOBAL] Init Failed", e);
            }
        };

        initGlobalPeer();

        return () => {
            // Optional: Destroy peer on logout, but keep alive during nav
            // peerRef.current?.destroy(); 
        };
    }, [identity]);

    return {
        peer: peerRef.current,
        isPeerReady,
        incomingConnection,
        clearIncoming: () => setIncomingConnection(null)
    };
};
