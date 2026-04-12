// @ts-nocheck
import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { WAREHOUSE } from './constants';

// --- Shared Geometries (Optimization) ---
const mastGeo = new THREE.BoxGeometry(0.2, 25, 0.4);
const baseGeo = new THREE.BoxGeometry(0.8, 1, 1.5);
const topGeo = new THREE.BoxGeometry(0.8, 0.5, 1.5);
const carriageGeo = new THREE.BoxGeometry(0.8, 0.2, 1.2);
const rackGeoBase = new THREE.BoxGeometry(1, 25, 110);
const boxGeoBase = new THREE.BoxGeometry(1, 1, 1);
const floorGeoBase = new THREE.BoxGeometry(1.5, 0.1, 110);

// --- Types ---
interface AsrsBox {
    position: [number, number, number];
    scale: [number, number, number];
    color: THREE.Color;
}

interface AsrsRack {
    position: [number, number, number];
}

interface AsrsData {
    rackInstances: AsrsRack[];
    boxInstances: AsrsBox[];
}

// --- Animated Crane Component ---
const AnimatedCrane: React.FC<{ aisleX: number, depth: number, height: number }> = ({ aisleX, depth, height }) => {
    const craneGroupRef = useRef<THREE.Group>(null);
    const carriageRef = useRef<THREE.Mesh>(null);
    const [target, setTarget] = useState({ z: 0, y: 5, wait: 0 });

    useFrame((_, delta) => {
        if (!craneGroupRef.current || !carriageRef.current) return;

        const currentZ = craneGroupRef.current.position.z;
        const diffZ = target.z - currentZ;
        const speedZ = 12 * delta;

        if (Math.abs(diffZ) > 0.1) {
            craneGroupRef.current.position.z += Math.sign(diffZ) * Math.min(Math.abs(diffZ), speedZ);
        }

        const currentY = carriageRef.current.position.y;
        const diffY = target.y - currentY;
        const speedY = 6 * delta;

        if (Math.abs(diffY) > 0.1) {
            carriageRef.current.position.y += Math.sign(diffY) * Math.min(Math.abs(diffY), speedY);
        }

        if (Math.abs(diffZ) < 0.2 && Math.abs(diffY) < 0.2) {
            if (target.wait > 0) {
                if (Math.random() < 0.02) {
                    const newZ = (Math.random() - 0.5) * (depth - 4);
                    const newY = Math.random() * (height - 4) + 2;
                    setTarget({ z: newZ, y: newY, wait: 1 });
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
    const width = WAREHOUSE.ASRS_X[1] - WAREHOUSE.ASRS_X[0];
    const depth = 110;
    const height = 25;

    const { rackInstances, boxInstances, floorXPositions } = useMemo(() => {
        const racks: AsrsRack[] = [];
        const boxes: AsrsBox[] = [];
        const floors: number[] = [];

        for (let i = 0; i < 12; i++) {
            const aisleX = (i - 6) * (width / 13) + 2;
            floors.push(aisleX);
            racks.push({ position: [aisleX - 1.5, height / 2, 0] });
            racks.push({ position: [aisleX + 1.5, height / 2, 0] });

            const addBoxes = (offsetX: number) => {
                for (let b = 0; b < 40; b++) {
                    if (Math.random() > 0.3) {
                        boxes.push({
                            position: [aisleX + offsetX, Math.random() * height * 0.9 + 1, (Math.random() - 0.5) * depth * 0.9],
                            scale: [0.8, 0.8, 1.0],
                            color: new THREE.Color().setHSL(Math.random(), 0.6, 0.3)
                        });
                    }
                }
            };
            addBoxes(-1.1);
            addBoxes(1.1);
        }
        return { rackInstances: racks, boxInstances: boxes, floorXPositions: floors };
    }, [width, height, depth]);

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
            <Instances range={50} geometry={rackGeoBase} material={new THREE.MeshStandardMaterial({ color: "#2c3e50" })} castShadow>
                {rackInstances.map((d, i) => <Instance key={i} position={d.position} />)}
            </Instances>

            <Instances range={2000} geometry={boxGeoBase} material={new THREE.MeshStandardMaterial({ color: "#ffffff" })} castShadow>
                {boxInstances.map((d, i) => <Instance key={i} position={d.position} scale={d.scale} color={d.color} />)}
            </Instances>

            <Instances range={12} geometry={floorGeoBase} material={new THREE.MeshStandardMaterial({ color: "#111" })}>
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
