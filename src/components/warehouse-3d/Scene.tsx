import React, { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useTranslation } from 'react-i18next';

import { useWarehouse3D } from './useWarehouse3D';
import { parseWarehouseSceneKeyboardCommand } from './warehouse3DInteraction';
import {
    WarehouseAdaptiveDpr,
    WarehouseGroundShadow,
    WarehouseOrbitControls,
    type WarehouseOrbitControlsHandle,
} from './WarehouseScenePrimitives';

const WarehouseModel = lazy(() => import('./WarehouseModel'));

export interface SceneProps {
    onModelReady?: () => void;
}

const Scene: React.FC<SceneProps> = ({ onModelReady }) => {
    const { t } = useTranslation();
    const { autoRotate, resetViewTrigger, setAutoRotate } = useWarehouse3D();
    const controlsRef = useRef<WarehouseOrbitControlsHandle>(null);

    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.reset();
        }
    }, [resetViewTrigger]);

    const handleSceneKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const command = parseWarehouseSceneKeyboardCommand(event.key);
        const controls = controlsRef.current;
        if (!command || !controls) return;

        event.preventDefault();
        setAutoRotate(false);

        const rotationStep = Math.PI / 18;
        switch (command) {
            case 'rotate-left':
                controls.setAzimuthalAngle(controls.getAzimuthalAngle() - rotationStep);
                break;
            case 'rotate-right':
                controls.setAzimuthalAngle(controls.getAzimuthalAngle() + rotationStep);
                break;
            case 'rotate-up':
                controls.setPolarAngle(controls.getPolarAngle() - rotationStep);
                break;
            case 'rotate-down':
                controls.setPolarAngle(controls.getPolarAngle() + rotationStep);
                break;
            case 'zoom-in':
                controls.dollyIn(1.2);
                break;
            case 'zoom-out':
                controls.dollyOut(1.2);
                break;
            case 'reset':
                controls.reset();
                break;
        }
        controls.update();
    }, [setAutoRotate]);

    const stopAutoRotateForManualControl = useCallback(() => {
        if (autoRotate) setAutoRotate(false);
    }, [autoRotate, setAutoRotate]);

    return (
        <div
            aria-describedby="warehouse-3d-scene-help"
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - Home"
            aria-label={t('diagram.warehouse3d.sceneLabel')}
            className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
            data-testid="warehouse-3d-scene-region"
            onKeyDown={handleSceneKeyDown}
            role="region"
            tabIndex={0}
        >
            {/* Three deprecates PCFSoftShadowMap and silently downgrades it to
                PCFShadowMap at render time, logging a warning on every scene
                boot. Selecting the PCF map directly produces the same shadows
                the renderer already falls back to, without the console noise. */}
            <Canvas
                shadows="percentage"
                dpr={1}
                camera={{ position: [-200, 180, 220], fov: 35 }}
                gl={{
                    antialias: true,
                    powerPreference: 'high-performance',
                    logarithmicDepthBuffer: true, // Industry best practice for large scale scenes to prevent z-fighting
                }}
            >
                <WarehouseOrbitControls
                    ref={controlsRef}
                    minPolarAngle={0}
                    maxPolarAngle={Math.PI / 2.1}
                    minDistance={30}
                    maxDistance={600}
                    enableDamping
                    autoRotate={autoRotate}
                    autoRotateSpeed={0.5}
                    onStart={stopAutoRotateForManualControl}
                />

                {/* Lighting */}
                <ambientLight intensity={0.5} />
                <directionalLight
                    position={[150, 200, 100]}
                    intensity={1.5}
                    castShadow
                    shadow-mapSize={[1024, 1024]}
                    shadow-bias={-0.001}
                    shadow-normalBias={0.04} // Helps with shadow acne on curved surfaces
                >
                    <orthographicCamera attach="shadow-camera" args={[-200, 200, 200, -200]} />
                </directionalLight>

                {/* Atmospheric Effects */}
                {/* Lightweight ground depth cue; real shadows still come from the directional light above. */}
                <WarehouseGroundShadow />

                <fog attach="fog" args={['#d0d0d0', 100, 800]} />

                {/* The Actual Content */}
                <Suspense fallback={null}>
                    <WarehouseModel onReady={onModelReady} />
                </Suspense>

                {/* Performance Adaptivity */}
                <WarehouseAdaptiveDpr pixelated />

                {/* Background color */}
                <color attach="background" args={['#d0d0d0']} />
            </Canvas>
        </div>
    );
};

export default Scene;
