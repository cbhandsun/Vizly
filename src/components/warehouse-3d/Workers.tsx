import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { WAREHOUSE } from './constants';

const Workers: React.FC = () => {
    // Shared Geometry for Worker (Simplified Low Poly)
    // Head, Body/Vest, Legs
    const headGeo = new THREE.SphereGeometry(0.3, 8, 8); // Slightly larger head
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.35); // Slightly larger body
    const legsGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25); // Thicker legs

    // Materials - High Contrast
    const skinMat = new THREE.MeshStandardMaterial({ color: "#f5cba7" });
    const vestMat = new THREE.MeshStandardMaterial({ color: "#00ff00", emissive: "#003300", emissiveIntensity: 0.2 }); // Neon Green + basic emissive
    const pantsMat = new THREE.MeshStandardMaterial({ color: "#1a1a1a" }); // Black pants

    // Generate positions
    const workerPositions = useMemo(() => {
        const pos = [];

        // 1. Packing Area - MORE WORKERS
        for (let i = 0; i < 5; i++) {
            pos.push([30, 0.9, -30 + i * 15 + 2]); // At station
            pos.push([35, 0.9, -30 + i * 15 - 2]); // Helper
        }

        // 2. Docks - GROUPS
        // Left (Receiving)
        pos.push([WAREHOUSE.LEFT_EDGE + 5, 0, -20]);
        pos.push([WAREHOUSE.LEFT_EDGE + 6, 0, -18]); // Chatting pair
        pos.push([WAREHOUSE.LEFT_EDGE + 5, 0, 0]);

        // Right (Shipping)
        pos.push([WAREHOUSE.RIGHT_EDGE - 5, 0, -20]);
        pos.push([WAREHOUSE.RIGHT_EDGE - 6, 0, -22]);
        pos.push([WAREHOUSE.RIGHT_EDGE - 5, 0, 0]);

        // 3. Mezzanine / Walkways
        for (let i = 0; i < 5; i++) {
            pos.push([65, 5, -20 + i * 10]); // Walking on mezzanine
        }

        return pos;
    }, []);

    return (
        <group>
            {/* Heads */}
            <Instances range={100} geometry={headGeo} material={skinMat} castShadow>
                {workerPositions.map((p, i) => (
                    <Instance key={`head-${i}`} position={[p[0], 1.7, p[1]] as [number, number, number]} />
                ))}
            </Instances>

            {/* Bodies (Vests) */}
            <Instances range={100} geometry={bodyGeo} material={vestMat} castShadow>
                {workerPositions.map((p, i) => (
                    <Instance key={`body-${i}`} position={[p[0], 1.15, p[1]] as [number, number, number]} />
                ))}
            </Instances>

            {/* Left Leg */}
            <Instances range={100} geometry={legsGeo} material={pantsMat} castShadow>
                {workerPositions.map((p, i) => (
                    <Instance key={`lleg-${i}`} position={[p[0] - 0.15, 0.45, p[1]] as [number, number, number]} />
                ))}
            </Instances>
            {/* Right Leg */}
            <Instances range={100} geometry={legsGeo} material={pantsMat} castShadow>
                {workerPositions.map((p, i) => (
                    <Instance key={`rleg-${i}`} position={[p[0] + 0.15, 0.45, p[1]] as [number, number, number]} />
                ))}
            </Instances>
        </group>
    );
};

export default Workers;
