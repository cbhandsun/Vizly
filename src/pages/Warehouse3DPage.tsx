
import React, { lazy, Suspense, useCallback, useState } from 'react';
import { Warehouse3DProvider } from '@/components/warehouse-3d/WarehouseContext';
import ControlsOverlay from '@/components/warehouse-3d/ControlsOverlay';
import { Warehouse3DErrorBoundary } from '@/components/warehouse-3d/Warehouse3DErrorBoundary';

const Scene = lazy(() => import('@/components/warehouse-3d/Scene'));

const Warehouse3DPage: React.FC = () => {
    const [sceneReady, setSceneReady] = useState(false);
    const [sceneKey, setSceneKey] = useState(0);
    const retryScene = useCallback(() => {
        setSceneReady(false);
        setSceneKey(current => current + 1);
    }, []);
    const markSceneReady = useCallback(() => setSceneReady(true), []);

    return (
        <Warehouse3DProvider>
            <div
                className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans"
                data-smoke-ready="warehouse-3d"
            >
                {/* Background mesh/glow effects */}
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900/80 to-slate-900"></div>
                
                <Warehouse3DErrorBoundary onRetry={retryScene}>
                    <Suspense fallback={null}>
                        <Scene
                            key={sceneKey}
                            onModelReady={markSceneReady}
                        />
                    </Suspense>
                    {!sceneReady && (
                        <div
                            aria-live="polite"
                            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/90 text-white backdrop-blur-sm"
                            role="status"
                        >
                            <div aria-hidden="true" className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
                            <div className="text-lg font-medium tracking-wide">正在加载 3D 场景…</div>
                        </div>
                    )}
                </Warehouse3DErrorBoundary>
                
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
