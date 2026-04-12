import React from 'react';
import { WAREHOUSE } from './constants';

const TruckModel: React.FC<{ color?: string, rotation?: [number, number, number] }> = ({ color = "#e74c3c", rotation = [0, 0, 0] }) => (
    <group rotation={rotation}>
        {/* Truck Cab */}
        <group position={[0, 1.5, 3.5]}>
            <mesh castShadow receiveShadow>
                <boxGeometry args={[2.5, 3, 2.5]} />
                <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, 0.5, 1.3]} castShadow>
                <boxGeometry args={[2.5, 1.5, 0.5]} />
                <meshStandardMaterial color={color} />
            </mesh>
            {/* Windows */}
            <mesh position={[0, 0.8, 1.56]}>
                <boxGeometry args={[2.3, 1, 0.1]} />
                <meshStandardMaterial color="#34495e" roughness={0.2} metalness={0.8} />
            </mesh>
            {/* Wheels */}
            <mesh position={[-1.3, -1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.5, 0.5, 0.5, 16]} />
                <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[1.3, -1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.5, 0.5, 0.5, 16]} />
                <meshStandardMaterial color="#111" />
            </mesh>
        </group>

        {/* Trailer */}
        <group position={[0, 2, -2]}>
            <mesh castShadow receiveShadow>
                <boxGeometry args={[2.6, 4, 10]} />
                <meshStandardMaterial color="#ecf0f1" />
            </mesh>
            {/* Trailer Wheels */}
            <group position={[0, -2, -3.5]}>
                <mesh position={[-1.3, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.5, 0.5, 0.5, 16]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                <mesh position={[1.3, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.5, 0.5, 0.5, 16]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                <mesh position={[-1.3, 0.5, 1.5]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.5, 0.5, 0.5, 16]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                <mesh position={[1.3, 0.5, 1.5]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.5, 0.5, 0.5, 16]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
            </group>
        </group>
    </group>
);

const Trucks: React.FC = () => {
    // Dock positions
    // In WarehouseModel/Docks (implied), doors are likely spaced out.
    // Docks Left: x = -150 (Wall), z = spaced
    // Trucks should be OUTSIDE the wall.
    // Warehouse width is 300 (-150 to 150).
    // Left Wall x = -150. Trucks should be at x < -150, facing +X (backed in).
    // Right Wall x = 150. Trucks should be at x > 150, facing -X (backed in).

    return (
        <group>
            {/* Receiving Docks (Left) */}
            {[-30, -15, 0, 15, 30].map((z, i) => (
                <group key={`rec-truck-${i}`} position={[WAREHOUSE.LEFT_EDGE - 12, 0.5, z]}>
                    <TruckModel rotation={[0, -Math.PI / 2, 0]} color={i % 2 === 0 ? "#c0392b" : "#dfe6e9"} />
                </group>
            ))}

            {/* Shipping Docks (Right) */}
            {[-20, 0, 20].map((z, i) => (
                <group key={`ship-truck-${i}`} position={[WAREHOUSE.RIGHT_EDGE + 12, 0.5, z]}>
                    <TruckModel rotation={[0, Math.PI / 2, 0]} color={i === 0 ? "#2980b9" : "#ffffff"} />
                </group>
            ))}
        </group>
    );
};

export default Trucks;
