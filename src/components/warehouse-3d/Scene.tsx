import React, { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import {
    OrbitControls, PerspectiveCamera, ContactShadows, Sky,
    AdaptiveDpr
} from '@react-three/drei';
import { useTranslation } from 'react-i18next';

import { useWarehouse3D } from './useWarehouse3D';
import { parseWarehouseSceneKeyboardCommand } from './warehouse3DInteraction';

const WarehouseModel = lazy(() => import('./WarehouseModel'));

export interface SceneProps {
    onModelReady?: () => void;
}

const Scene: React.FC<SceneProps> = ({ onModelReady }) => {
    const { t } = useTranslation();
    const { autoRotate, resetViewTrigger, setAutoRotate } = useWarehouse3D();
    const controlsRef = useRef<React.ElementRef<typeof OrbitControls>>(null);

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
            <Canvas
                shadows
                dpr={1}
                gl={{
                    antialias: true,
                    powerPreference: 'high-performance',
                    logarithmicDepthBuffer: true, // Industry best practice for large scale scenes to prevent z-fighting
                }}
            >
                <PerspectiveCamera makeDefault position={[-200, 180, 220]} fov={35} />
                <OrbitControls
                    ref={controlsRef}
                    makeDefault
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
                {/* Lift shadows purely slightly above floor (Best practice: prevent coincident geometry) */}
                <ContactShadows position={[0, 0.02, 0]} resolution={512} scale={500} blur={2} opacity={0.55} far={20} color="#1a1a1a" frames={1} />
                {/* <Environment preset="warehouse" /> */}
                <Sky distance={450000} sunPosition={[0, 1, -1]} inclination={0} azimuth={0.25} />

                <fog attach="fog" args={['#d0d0d0', 100, 800]} />

                {/* The Actual Content */}
                <Suspense fallback={null}>
                    <WarehouseModel onReady={onModelReady} />
                </Suspense>

                {/* Performance Adaptivity */}
                <AdaptiveDpr pixelated />

                {/* Background color */}
                <color attach="background" args={['#d0d0d0']} />
            </Canvas>
        </div>
    );
};

export default Scene;
