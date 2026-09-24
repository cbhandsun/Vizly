
import React, { lazy, Suspense, useCallback, useState } from 'react';
import { Warehouse3DProvider } from '@/components/warehouse-3d/WarehouseContext';
import ControlsOverlay from '@/components/warehouse-3d/ControlsOverlay';
import { Warehouse3DErrorBoundary } from '@/components/warehouse-3d/Warehouse3DErrorBoundary';
import Warehouse3DShell from '@/components/warehouse-3d/Warehouse3DShell';

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
            <Warehouse3DShell
                controls={<ControlsOverlay />}
                loading={!sceneReady}
            >
                <Warehouse3DErrorBoundary onRetry={retryScene}>
                    <Suspense fallback={null}>
                        <Scene
                            key={sceneKey}
                            onModelReady={markSceneReady}
                        />
                    </Suspense>
                </Warehouse3DErrorBoundary>
            </Warehouse3DShell>
        </Warehouse3DProvider>
    );
};

export default Warehouse3DPage;
