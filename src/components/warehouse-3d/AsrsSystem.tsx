import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { WAREHOUSE } from './constants';
import { createAsrsLayout, getAsrsDimensions, getRandomCraneTarget, type CraneTarget } from './asrsLayout';

// --- Shared Geometries (Optimization) ---
const mastGeo = new THREE.BoxGeometry(0.2, 25, 0.4);
const baseGeo = new THREE.BoxGeometry(0.8, 1, 1.5);
const topGeo = new THREE.BoxGeometry(0.8, 0.5, 1.5);
const carriageGeo = new THREE.BoxGeometry(0.8, 0.2, 1.2);
const rackGeoBase = new THREE.BoxGeometry(1, 25, 110);
const boxGeoBase = new THREE.BoxGeometry(1, 1, 1);
const floorGeoBase = new THREE.BoxGeometry(1.5, 0.1, 110);
const rackMaterial = new THREE.MeshStandardMaterial({ color: '#2c3e50' });
const boxMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff' });
const floorMaterial = new THREE.MeshStandardMaterial({ color: '#111' });

// --- Animated Crane Component ---
const AnimatedCrane: React.FC<{ aisleX: number; depth: number; height: number }> = ({ aisleX, depth, height }) => {
    const craneGroupRef = useRef<THREE.Group>(null);
    const carriageRef = useRef<THREE.Mesh>(null);
    const [target, setTarget] = useState<CraneTarget>({ z: 0, y: 5, wait: 0 });

    useFrame((_, delta) => {
        if (!craneGroupRef.current || !carriageRef.current) return;
        const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;

        const currentZ = craneGroupRef.current.position.z;
        const diffZ = target.z - currentZ;
        const speedZ = 12 * safeDelta;

        if (Math.abs(diffZ) > 0.1) {
            craneGroupRef.current.position.z += Math.sign(diffZ) * Math.min(Math.abs(diffZ), speedZ);
        }

        const currentY = carriageRef.current.position.y;
        const diffY = target.y - currentY;
        const speedY = 6 * safeDelta;

        if (Math.abs(diffY) > 0.1) {
            carriageRef.current.position.y += Math.sign(diffY) * Math.min(Math.abs(diffY), speedY);
        }

        if (Math.abs(diffZ) < 0.2 && Math.abs(diffY) < 0.2) {
            if (target.wait > 0) {
                if (Math.random() < 0.02) {
                    setTarget(getRandomCraneTarget(depth, height));
                }
            } else {
                setTarget(prev => ({ ...prev, wait: 1 }));
            }
        }
    });

    return (
        <group ref={craneGroupRef} position={[aisleX, 0, 0]}>
            <mesh position={[0, height / 2, 0]} geometry={mastGeo}>
                <meshStandardMaterial color="#f1c40f" metalness={0.6} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.5, 0]} geometry={baseGeo}>
                <meshStandardMaterial color="#2c3e50" />
            </mesh>
            <mesh position={[0, height, 0]} geometry={topGeo}>
                <meshStandardMaterial color="#2c3e50" />
            </mesh>
            <mesh ref={carriageRef} position={[0, 5, 0.4]} geometry={carriageGeo}>
                <meshStandardMaterial color="#e67e22" />
            </mesh>
        </group>
    );
};

const AsrsSystem: React.FC = () => {
    const { width, depth, height } = getAsrsDimensions(WAREHOUSE.ASRS_X);
    const { rackInstances, boxInstances, floorXPositions } = useMemo(
        () => createAsrsLayout(width, depth, height),
        [width, depth, height]
    );

    return (
        <group position={[(WAREHOUSE.ASRS_X[0] + WAREHOUSE.ASRS_X[1]) / 2, 0, -5]}>
            {/* Structural Enclosure */}
            <mesh position={[0, height / 2, 0]}>
                <boxGeometry args={[width, height, depth]} />
                <meshStandardMaterial color={WAREHOUSE.COLORS.ASRS_FRAME} wireframe />
            </mesh>
            <mesh position={[0, height, 0]}>
                <boxGeometry args={[width, 0.5, depth]} />
                <meshStandardMaterial color="#34495e" transparent opacity={0.3} depthWrite={false} />
            </mesh>

            {/* Optimized Static Infrastructure */}
            <Instances range={50} geometry={rackGeoBase} material={rackMaterial} castShadow>
                {rackInstances.map((d, i) => <Instance key={i} position={d.position} />)}
            </Instances>

            <Instances range={2000} geometry={boxGeoBase} material={boxMaterial} castShadow>
                {boxInstances.map((d, i) => <Instance key={i} position={d.position} scale={d.scale} color={d.color} />)}
            </Instances>

            <Instances range={12} geometry={floorGeoBase} material={floorMaterial}>
                {floorXPositions.map((x, i) => <Instance key={i} position={[x, 0.1, 0]} />)}
            </Instances>

            {/* Animated Cranes */}
            {floorXPositions.map((x, i) => (
                <AnimatedCrane key={i} aisleX={x} depth={depth} height={height} />
            ))}
        </group>
    );
};

export default AsrsSystem;
