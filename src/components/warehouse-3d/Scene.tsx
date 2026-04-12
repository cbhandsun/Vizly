import React from 'react';
import { Canvas } from '@react-three/fiber';
import {
    OrbitControls, Environment, PerspectiveCamera, ContactShadows, Sky,
    AdaptiveDpr, AdaptiveEvents, Bvh
} from '@react-three/drei';
import WarehouseModel from './WarehouseModel';

import { useWarehouse3D } from './WarehouseContext';
import { useRef, useEffect } from 'react';

const Scene: React.FC = () => {
    const { autoRotate, resetViewTrigger } = useWarehouse3D();
    const controlsRef = useRef<any>(null);

    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.reset();
        }
    }, [resetViewTrigger]);

    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            gl={{
                antialias: true,
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
                autoRotate={false} // Disable auto-rotate to keep the requested angle steady
                autoRotateSpeed={0.5}
            />

            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <directionalLight
                position={[150, 200, 100]}
                intensity={1.5}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.001}
                shadow-normalBias={0.04} // Helps with shadow acne on curved surfaces
            >
                <orthographicCamera attach="shadow-camera" args={[-200, 200, 200, -200]} />
            </directionalLight>

            {/* Atmospheric Effects */}
            {/* Lift shadows purely slightly above floor (Best practice: prevent coincident geometry) */}
            <ContactShadows position={[0, 0.02, 0]} resolution={1024} scale={500} blur={2} opacity={0.6} far={20} color="#1a1a1a" frames={1} />
            {/* <Environment preset="warehouse" /> */}
            <Sky distance={450000} sunPosition={[0, 1, -1]} inclination={0} azimuth={0.25} />

            <fog attach="fog" args={['#d0d0d0', 100, 800]} />

            {/* The Actual Content */}
            {/* Optimized Raycasting */}
            <Bvh firstHitOnly>
                <WarehouseModel />
            </Bvh>

            {/* Performance Adaptivity */}
            <AdaptiveDpr pixelated />
            <AdaptiveEvents />

            {/* Background color */}
            <color attach="background" args={['#d0d0d0']} />
        </Canvas>
    );
};

export default Scene;
