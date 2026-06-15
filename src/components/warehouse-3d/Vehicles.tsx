import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWarehouse3D } from './useWarehouse3D';

// --- Shared Geometries (Optimization: Create once) ---
const chassisGeo = new THREE.BoxGeometry(1.5, 0.8, 2.5);
const cabinGeo = new THREE.BoxGeometry(1.4, 1.2, 1.4);
const roofGeo = new THREE.BoxGeometry(1.5, 0.1, 1.5);
const mastGeo = new THREE.BoxGeometry(0.8, 3, 0.2);
const forkGeo = new THREE.BoxGeometry(0.15, 0.1, 1.2);
const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
const loadGeo = new THREE.BoxGeometry(1.2, 1, 1.2);

const ForkliftModel: React.FC<{ color?: string, hasLoad?: boolean }> = ({ color = "#f1c40f", hasLoad = false }) => {
    const { showRealism } = useWarehouse3D();

    return (
        <group>
            {/* Chassis */}
            <mesh position={[0, 0.6, 0]} geometry={chassisGeo} castShadow>
                <meshStandardMaterial color={color} />
            </mesh>
            {/* Cabin / Cage */}
            <mesh position={[0, 1.6, 0.5]} geometry={cabinGeo} castShadow>
                <meshStandardMaterial color="#34495e" transparent opacity={0.3} />
            </mesh>
            <mesh position={[0, 2.25, 0.5]} geometry={roofGeo}>
                <meshStandardMaterial color={color} />
            </mesh>
            {/* Mast */}
            <mesh position={[0, 1.5, -1.3]} geometry={mastGeo}>
                <meshStandardMaterial color="#2c3e50" />
            </mesh>
            {/* Forks */}
            <group position={[0, 0.5, -1.4]}>
                <mesh position={[-0.3, 0, -0.6]} geometry={forkGeo}>
                    <meshStandardMaterial color="#95a5a6" />
                </mesh>
                <mesh position={[0.3, 0, -0.6]} geometry={forkGeo}>
                    <meshStandardMaterial color="#95a5a6" />
                </mesh>
            </group>
            {/* Load (Optional) */}
            {hasLoad && (
                <mesh position={[0, 0.8, -1.6]} geometry={loadGeo} castShadow>
                    <meshStandardMaterial color="#e67e22" />
                </mesh>
            )}
            {/* Wheels */}
            <mesh position={[-0.8, 0.4, 0.8]} rotation={[0, 0, Math.PI / 2]} geometry={wheelGeo}>
                <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[0.8, 0.4, 0.8]} rotation={[0, 0, Math.PI / 2]} geometry={wheelGeo}>
                <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[-0.8, 0.4, -0.8]} rotation={[0, 0, Math.PI / 2]} geometry={wheelGeo}>
                <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[0.8, 0.4, -0.8]} rotation={[0, 0, Math.PI / 2]} geometry={wheelGeo}>
                <meshStandardMaterial color="#111" />
            </mesh>

            {/* Blue Safety Light Projection */}
            {showRealism && (
                <group position={[0, 0.05, -5]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[1.2, 1.2]} />
                        <meshBasicMaterial color="#3498db" transparent opacity={0.6} />
                    </mesh>
                    <pointLight color="#3498db" intensity={2} distance={5} />
                </group>
            )}
        </group>
    );
};

const AnimatedVehicle: React.FC<{
    path: [number, number, number][],
    speed?: number,
    color?: string,
    initialOffset?: number
}> = ({ path, speed = 5, color, initialOffset = 0 }) => {
    const groupRef = useRef<THREE.Group>(null);
    const progress = useRef(initialOffset * path.length);

    useFrame((_, delta) => {
        if (!groupRef.current) return;

        const currentIdx = Math.floor(progress.current) % path.length;
        const targetIdx = (currentIdx + 1) % path.length;

        const p2 = new THREE.Vector3(...path[targetIdx]);
        const direction = new THREE.Vector3().subVectors(p2, groupRef.current.position);
        const distanceToTarget = direction.length();

        if (distanceToTarget < 0.2) {
            progress.current += 1;
        } else {
            direction.normalize().multiplyScalar(speed * delta);
            groupRef.current.position.add(direction);
            groupRef.current.lookAt(p2);
        }
    });

    return (
        <group ref={groupRef} position={path[0]}>
            <ForkliftModel color={color} hasLoad={true} />
        </group>
    );
};

const Vehicles: React.FC = () => {
    const receivingPath: [number, number, number][] = [
        [-130, 0, -20], [-110, 0, -20], [-110, 0, -40], [-90, 0, -40], [-90, 0, -20], [-110, 0, -20], [-130, 0, -20]
    ];
    const replenishmentPath: [number, number, number][] = [
        [-60, 0, 40], [-40, 0, 50], [40, 0, 50], [40, 0, 10], [80, 0, 10], [40, 0, 10], [40, 0, 50], [-60, 0, 50]
    ];
    const shippingPath: [number, number, number][] = [
        [100, 0, 30], [125, 0, 30], [125, 0, -10], [125, 0, 30], [100, 0, 30]
    ];

    return (
        <group>
            <AnimatedVehicle path={receivingPath} speed={6} color="#e67e22" initialOffset={0} />
            <AnimatedVehicle path={receivingPath} speed={6} color="#f39c12" initialOffset={0.45} />
            <AnimatedVehicle path={replenishmentPath} speed={8} color="#f1c40f" initialOffset={0.15} />
            <AnimatedVehicle path={replenishmentPath} speed={8} color="#f1c40f" initialOffset={0.65} />
            <AnimatedVehicle path={shippingPath} speed={7} color="#d35400" initialOffset={0.25} />
        </group>
    );
};

export default Vehicles;
