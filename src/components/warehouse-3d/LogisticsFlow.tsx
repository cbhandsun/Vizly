import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const FlowArrow: React.FC<{ position: [number, number, number], rotation?: [number, number, number] }> = ({ position, rotation = [0, 0, 0] }) => {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (meshRef.current) {
            // Subtle pulsing/moving effect - reduced speed
            meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime) * 0.3;
        }
    });

    return (
        <mesh ref={meshRef} position={position} rotation={rotation}>
            <coneGeometry args={[1, 3, 4]} />
            <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={0.5} />
        </mesh>
    );
};

import { useWarehouse3D } from './useWarehouse3D';

const LogisticsFlow: React.FC = () => {
    const { showFlow } = useWarehouse3D();

    if (!showFlow) return null;

    return (
        <group>
            {/* Main Flow Path following the arrows in the image */}
            {/* Top Flow (Left to Right) */}
            <FlowArrow position={[-120, 8, -65]} rotation={[0, 0, -Math.PI / 2]} />
            <FlowArrow position={[-60, 8, -65]} rotation={[0, 0, -Math.PI / 2]} />
            <FlowArrow position={[0, 8, -65]} rotation={[0, 0, -Math.PI / 2]} />
            <FlowArrow position={[60, 8, -65]} rotation={[0, 0, -Math.PI / 2]} />

            {/* Bottom Flow (Right to Left) */}
            <FlowArrow position={[80, 8, 45]} rotation={[0, 0, Math.PI / 2]} />
            <FlowArrow position={[20, 8, 45]} rotation={[0, 0, Math.PI / 2]} />
            <FlowArrow position={[-40, 8, 45]} rotation={[0, 0, Math.PI / 2]} />

            {/* Inbound to high bay */}
            <FlowArrow position={[-115, 8, -20]} rotation={[0, 0, -Math.PI / 2]} />
            <FlowArrow position={[-115, 8, 20]} rotation={[0, 0, -Math.PI / 2]} />
        </group>
    );
};

export default LogisticsFlow;
