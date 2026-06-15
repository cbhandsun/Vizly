
import React, { Suspense, useState } from 'react';
import Scene from '@/components/warehouse-3d/Scene';
import { Warehouse3DProvider } from '@/components/warehouse-3d/WarehouseContext';
import ControlsOverlay from '@/components/warehouse-3d/ControlsOverlay';

const Warehouse3DPage: React.FC = () => {
    const [sceneReady, setSceneReady] = useState(false);

    return (
        <Warehouse3DProvider>
            <div
                className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans"
                data-smoke-ready={sceneReady ? 'warehouse-3d' : undefined}
            >
                {/* Background mesh/glow effects */}
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900/80 to-slate-900"></div>
                
                <Suspense fallback={
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white z-50 backdrop-blur-sm">
                        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                        <div className="text-lg font-medium tracking-wide">Loading 3D Environment...</div>
                    </div>
                }>
                    <Scene onReady={() => setSceneReady(true)} />
                </Suspense>
                
                {/* Modern Floating Header Panel */}
                <div className="absolute top-4 left-4 z-10 pointer-events-none">
                    <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 p-3 px-4 rounded-lg shadow-sm">
                        <h1 className="text-[15px] font-semibold text-white m-0 tracking-tight leading-none">Large Retail Logistics Center</h1>
                        <p className="text-slate-400 font-medium mt-1 mb-0 text-[11px] uppercase tracking-wider">Interactive 3D Simulation View</p>
                    </div>
                </div>
                
                {/* Overlay Controls */}
                <div className="relative z-20">
                    <ControlsOverlay />
                </div>
            </div>
        </Warehouse3DProvider>
    );
};

export default Warehouse3DPage;
