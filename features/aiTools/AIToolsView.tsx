
import React, { useState, memo, useCallback } from 'react';
import { Fingerprint, ImagePlus, Aperture, Activity, Cpu } from 'lucide-react';
import { GenerativeStudio } from './components/GenerativeStudio';
import { NeuralVision } from './components/NeuralVision';

const AIToolsView: React.FC = memo(() => {
    const [activeSection, setActiveSection] = useState<'GENERATIVE' | 'ANALYTIC' | null>('GENERATIVE');

    const toggleSection = useCallback((section: 'GENERATIVE' | 'ANALYTIC') => {
        setActiveSection(prev => prev === section ? null : section);
    }, []);

    return (
        <div className="h-full w-full overflow-y-auto custom-scroll flex flex-col px-4 pb-32 pt-[calc(env(safe-area-inset-top)+1.5rem)] md:px-8 md:pt-12 md:pb-40 lg:px-12 animate-fade-in bg-noise relative z-10 overscroll-none">
            
            {/* Ambient Background Orbs - GPU Accelerated & Optimized */}
            <div className="fixed top-[-10%] right-[-5%] w-[500px] h-[500px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none animate-pulse-slow will-change-transform transform-gpu translate-z-0"></div>
            <div className="fixed bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-cyan-600/5 blur-[150px] rounded-full pointer-events-none animate-float will-change-transform transform-gpu translate-z-0"></div>

            <div className="max-w-[1400px] mx-auto w-full space-y-10 relative z-10">
                
                {/* Unified Header v105 */}
                <header className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-8 animate-slide-up pb-4 will-change-transform">
                    <div className="space-y-4 flex-1">
                        <div className="flex items-center gap-4">
                            <div className="px-4 py-2 rounded-xl bg-skin-card border border-skin-border backdrop-blur-md tech-mono text-[9px] font-black uppercase text-accent tracking-[0.3em] shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] flex items-center gap-2 sheen">
                                <Fingerprint size={12} /> NEURAL_ARSENAL_v2.0
                            </div>
                            <div className="h-[1px] w-12 bg-gradient-to-r from-accent/50 to-transparent"></div>
                        </div>
                        <h2 className="text-[13vw] md:text-[6rem] xl:text-[7rem] font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-skin-text via-skin-text to-skin-muted leading-[0.85] uppercase drop-shadow-sm break-words">
                             NEURAL <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-purple-500 animate-gradient-text">TOOLS</span>
                        </h2>
                    </div>
                    
                    <div className="flex items-center gap-3 px-6 py-4 bg-skin-card/60 border border-skin-border rounded-2xl tech-mono text-[9px] font-black uppercase tracking-widest text-skin-muted shadow-lg backdrop-blur-xl group hover:border-accent/30 transition-all hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)] sheen">
                         <div className="relative">
                            <Activity size={14} className="text-emerald-500 animate-pulse" /> 
                            <div className="absolute inset-0 bg-emerald-500 blur-sm opacity-50 animate-pulse"></div>
                         </div>
                         <span className="group-hover:text-skin-text transition-colors">MULTI_ENGINE_READY</span>
                    </div>
                </header>

                <div className="space-y-6 transform-gpu pb-20">
                    <GenerativeStudio 
                        isOpen={activeSection === 'GENERATIVE'} 
                        onToggle={() => toggleSection('GENERATIVE')}
                        icon={<ImagePlus />}
                    />

                    <NeuralVision 
                        isOpen={activeSection === 'ANALYTIC'} 
                        onToggle={() => toggleSection('ANALYTIC')}
                        icon={<Aperture />}
                    />
                </div>
                
                {/* Footer Status */}
                 <div className="flex justify-center pt-8 pb-4 opacity-40">
                    <div className="flex items-center gap-2 text-[9px] font-mono text-skin-muted uppercase tracking-widest">
                        <Cpu size={12} />
                        <span>GPU_ACCELERATION: ENABLED</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default AIToolsView;
