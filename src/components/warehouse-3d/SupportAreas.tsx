import React from 'react';
import { WAREHOUSE } from './constants';

const Room: React.FC<{ position: [number, number, number], size: [number, number, number], label: string }> = ({ position, size, label }) => {
    return (
        <group position={position}>
            {/* Walls */}
            <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={size} />
                <meshStandardMaterial color="#ecf0f1" transparent opacity={0.6} />
            </mesh>
            {/* Outline */}
            <mesh position={[0, size[1] / 2, 0]}>
                <boxGeometry args={[size[0] + 0.1, size[1] + 0.1, size[2] + 0.1]} />
                <meshStandardMaterial color="#34495e" wireframe />
            </mesh>

            {/* Interior visual (Desks - simplified) */}
            {label.includes('Office') && (
                Array.from({ length: 4 }).map((_, i) => (
                    <mesh key={i} position={[(i - 1.5) * 6, 1, 0]}>
                        <boxGeometry args={[4, 1.5, 3]} />
                        <meshStandardMaterial color="#bdc3c7" />
                    </mesh>
                ))
            )}
        </group>
    );
};

const SupportAreas: React.FC = () => {
    const zPos = (WAREHOUSE.SUPPORT_Z[0] + WAREHOUSE.SUPPORT_Z[1]) / 2;
    const height = 10;
    const depth = WAREHOUSE.SUPPORT_Z[1] - WAREHOUSE.SUPPORT_Z[0];

    return (
        <group position={[0, 0, zPos]}>
            {/* Forklift Charging area (Left) */}
            <Room position={[-110, 0, 0]} size={[60, height, depth]} label="Forklift Area" />

            {/* Maintenance (Middle-Left) */}
            <Room position={[-40, 0, 0]} size={[50, height, depth]} label="Maintenance" />

            {/* IT Room (Middle) */}
            <Room position={[20, 0, 0]} size={[40, height, depth]} label="IT Room" />

            {/* Office (Right) */}
            <Room position={[100, 0, 0]} size={[90, height, depth]} label="Office" />
        </group>
    );
};

export default SupportAreas;
