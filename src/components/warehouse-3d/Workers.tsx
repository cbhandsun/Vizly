import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WAREHOUSE } from './constants';
import { WarehouseInstancedMesh } from './WarehouseInstancedMesh';

const headGeo = new THREE.SphereGeometry(0.3, 8, 8);
const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.35);
const legsGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
const skinMat = new THREE.MeshStandardMaterial({ color: '#f5cba7' });
const vestMat = new THREE.MeshStandardMaterial({ color: '#00ff00', emissive: '#003300', emissiveIntensity: 0.2 });
const pantsMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a' });

const Workers: React.FC = () => {
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
            <WarehouseInstancedMesh
                capacity={100}
                geometry={headGeo}
                material={skinMat}
                instances={workerPositions.map(p => ({ position: [p[0], 1.7, p[1]] as [number, number, number] }))}
                castShadow
            />

            {/* Bodies (Vests) */}
            <WarehouseInstancedMesh
                capacity={100}
                geometry={bodyGeo}
                material={vestMat}
                instances={workerPositions.map(p => ({ position: [p[0], 1.15, p[1]] as [number, number, number] }))}
                castShadow
            />

            {/* Left Leg */}
            <WarehouseInstancedMesh
                capacity={100}
                geometry={legsGeo}
                material={pantsMat}
                instances={workerPositions.map(p => ({ position: [p[0] - 0.15, 0.45, p[1]] as [number, number, number] }))}
                castShadow
            />
            {/* Right Leg */}
            <WarehouseInstancedMesh
                capacity={100}
                geometry={legsGeo}
                material={pantsMat}
                instances={workerPositions.map(p => ({ position: [p[0] + 0.15, 0.45, p[1]] as [number, number, number] }))}
                castShadow
            />
        </group>
    );
};

export default Workers;
