import React from 'react';
import { WAREHOUSE } from './constants';

const DockDoor: React.FC<{ position: [number, number, number], rotation?: [number, number, number] }> = ({ position, rotation = [0, 0, 0] }) => {
    return (
        <group position={position} rotation={rotation}>
            {/* Door Frame */}
            <mesh position={[0, 4, 0]}>
                <boxGeometry args={[6, 8, 1.2]} />
                <meshStandardMaterial color="#7f8c8d" />
            </mesh>
            {/* Blue Shutter */}
            <mesh position={[0, 4, -0.1]}>
                <boxGeometry args={[5.5, 7.5, 0.5]} />
                <meshStandardMaterial color={WAREHOUSE.COLORS.DOCK_DOOR} metalness={0.5} roughness={0.2} />
            </mesh>
            {/* Leveler Base */}
            <mesh position={[0, -0.4, 4]}>
                <boxGeometry args={[6, 1, 8]} />
                <meshStandardMaterial color="#95a5a6" />
            </mesh>
        </group>
    );
};

// Helper for random staging pallets
const ReceivingPallets: React.FC<{ zPos: number }> = ({ zPos }) => {
    // 4-5 stacks per door for better visibility
    return (
        <group position={[15, 0, zPos]}> {/* Relative to DockDoor parents offset, x ~ -135 absolute */}
            {/* Stack 1 */}
            <group position={[0, 0, 2]}>
                <mesh position={[0, 0.1, 0]}>
                    <boxGeometry args={[1.2, 0.2, 1.2]} />
                    <meshStandardMaterial color="#A0522D" />
                </mesh>
                <mesh position={[0, 0.7, 0]}>
                    <boxGeometry args={[1, 0.9, 1]} />
                    <meshStandardMaterial color="#3498db" /> {/* Blue items */}
                </mesh>
            </group>
            {/* Stack 2 */}
            <group position={[2, 0, -1]}>
                <mesh position={[0, 0.1, 0]}>
                    <boxGeometry args={[1.2, 0.2, 1.2]} />
                    <meshStandardMaterial color="#A0522D" />
                </mesh>
                <mesh position={[0, 0.6, 0]}>
                    <boxGeometry args={[1, 0.8, 1]} />
                    <meshStandardMaterial color="#e74c3c" /> {/* Red items */}
                </mesh>
            </group>
            {/* Stack 3 */}
            <group position={[1, 0, 4]}>
                <mesh position={[0, 0.1, 0]}>
                    <boxGeometry args={[1.2, 0.2, 1.2]} />
                    <meshStandardMaterial color="#A0522D" />
                </mesh>
                <mesh position={[0, 0.6, 0]}>
                    <boxGeometry args={[1, 0.8, 1]} />
                    <meshStandardMaterial color="#2ecc71" /> {/* Green items */}
                </mesh>
            </group>
            {/* Stack 4 - Random Yellow Boxes */}
            <group position={[3.5, 0, 1.5]}>
                <mesh position={[0, 0.1, 0]}>
                    <boxGeometry args={[1.2, 0.2, 1.2]} />
                    <meshStandardMaterial color="#A0522D" />
                </mesh>
                <mesh position={[0, 0.8, 0]}>
                    <boxGeometry args={[1, 1.2, 1]} />
                    <meshStandardMaterial color="#f1c40f" />
                </mesh>
            </group>
        </group>
    );
};

const Docks: React.FC = () => {
    const dockCount = 6;
    const spacing = 15;
    const startZ = -((dockCount - 1) * spacing) / 2;

    return (
        <group>
            {/* Inbound Docks (Left) */}
            <group position={[WAREHOUSE.LEFT_EDGE + 0.5, 0, 0]}>
                {Array.from({ length: dockCount }).map((_, i) => (
                    <group key={`in-group-${i}`}>
                        <DockDoor key={`in-${i}`} position={[0, 0, startZ + i * spacing]} rotation={[0, Math.PI / 2, 0]} />
                        {/* Staging Area Goods */}
                        {i >= 0 && <ReceivingPallets zPos={startZ + i * spacing} />}
                    </group>
                ))}
            </group>

            {/* Outbound Docks (Right) */}
            <group position={[WAREHOUSE.RIGHT_EDGE - 0.5, 0, 0]}>
                {Array.from({ length: dockCount }).map((_, i) => (
                    <DockDoor key={`out-${i}`} position={[0, 0, startZ + i * spacing]} rotation={[0, -Math.PI / 2, 0]} />
                ))}
            </group>
        </group>
    );
};

export default Docks;
