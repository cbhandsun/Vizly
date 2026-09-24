import React from 'react';
import { WAREHOUSE } from './constants';
import FloorMarkings from './FloorMarkings';

const Floor: React.FC = () => {
    return (
        <group>
            {/* Ground plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -1, 0]}>
                <planeGeometry args={[WAREHOUSE.WIDTH + 100, WAREHOUSE.DEPTH + 100]} />
                <meshStandardMaterial color="#b0b0b0" roughness={1} />
            </mesh>

            {/* Internal Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
                <planeGeometry args={[WAREHOUSE.WIDTH, WAREHOUSE.DEPTH]} />
                <meshStandardMaterial color={WAREHOUSE.COLORS.FLOOR} roughness={0.8} metalness={0.1} />
            </mesh>


            {/* Outer Walls */}
            <group>
                {/* Top wall */}
                <mesh position={[0, WAREHOUSE.HEIGHT / 2, WAREHOUSE.TOP_EDGE]}>
                    <boxGeometry args={[WAREHOUSE.WIDTH, WAREHOUSE.HEIGHT, WAREHOUSE.WALL_THICKNESS]} />
                    <meshStandardMaterial color={WAREHOUSE.COLORS.WALLS} transparent opacity={0.15} depthWrite={false} />
                </mesh>

                {/* Bottom wall */}
                <mesh position={[0, WAREHOUSE.HEIGHT / 2, WAREHOUSE.BOTTOM_EDGE]}>
                    <boxGeometry args={[WAREHOUSE.WIDTH, WAREHOUSE.HEIGHT, WAREHOUSE.WALL_THICKNESS]} />
                    <meshStandardMaterial color={WAREHOUSE.COLORS.WALLS} transparent opacity={0.15} depthWrite={false} />
                </mesh>

                {/* Left wall (with dock openings) */}
                <mesh position={[WAREHOUSE.LEFT_EDGE, WAREHOUSE.HEIGHT / 2, 0]}>
                    <boxGeometry args={[WAREHOUSE.WALL_THICKNESS, WAREHOUSE.HEIGHT, WAREHOUSE.DEPTH]} />
                    <meshStandardMaterial color={WAREHOUSE.COLORS.WALLS} transparent opacity={0.15} depthWrite={false} />
                </mesh>

                {/* Right wall (with dock openings) */}
                <mesh position={[WAREHOUSE.RIGHT_EDGE, WAREHOUSE.HEIGHT / 2, 0]}>
                    <boxGeometry args={[WAREHOUSE.WALL_THICKNESS, WAREHOUSE.HEIGHT, WAREHOUSE.DEPTH]} />
                    <meshStandardMaterial color={WAREHOUSE.COLORS.WALLS} transparent opacity={0.15} depthWrite={false} />
                </mesh>
            </group>

            {/* Internal Partitions (Support area) */}
            <mesh position={[0, 4, WAREHOUSE.SUPPORT_Z[0]]} receiveShadow>
                <boxGeometry args={[WAREHOUSE.WIDTH, 8, 0.5]} />
                <meshStandardMaterial color="#dfe6e9" transparent opacity={0.5} />
            </mesh>

            <FloorMarkings />
        </group>
    );
};

export default Floor;
