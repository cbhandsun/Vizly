import React, { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import { WAREHOUSE } from './constants';
import { useWarehouse3D } from './useWarehouse3D';

const StructuralElements: React.FC = () => {
    const { showRealism } = useWarehouse3D();

    // Pillar Grid: Spacing 30m, avoiding central conveyor aisles
    const pillars = useMemo(() => {
        const items = [];
        const spacingX = 40;
        const spacingZ = 30;
        const startX = WAREHOUSE.LEFT_EDGE + 20;
        const endX = WAREHOUSE.RIGHT_EDGE - 20;
        const startZ = WAREHOUSE.TOP_EDGE + 15;
        const endZ = WAREHOUSE.BOTTOM_EDGE - 15;

        for (let x = startX; x <= endX; x += spacingX) {
            for (let z = startZ; z <= endZ; z += spacingZ) {
                // Avoid pillars inside major conveyor or ASRS blocks
                const insideConveyor = x > 95 && x < 120;
                const insideAsrs = x > -55 && x < 25 && Math.abs(z) < 40;

                if (!insideConveyor && !insideAsrs) {
                    items.push({ position: [x, WAREHOUSE.HEIGHT / 2, z] });
                }
            }
        }
        return items;
    }, []);

    if (!showRealism) return null;

    return (
        <group>
            {/* Structural Columns (IPE Beams) */}
            <Instances range={pillars.length} castShadow receiveShadow>
                <boxGeometry args={[0.8, WAREHOUSE.HEIGHT, 0.8]} />
                <meshStandardMaterial color="#7f8c8d" metalness={0.6} roughness={0.2} />
                {pillars.map((p, i) => (
                    <Instance key={i} position={p.position as [number, number, number]} />
                ))}
            </Instances>

            {/* Pillar Bases */}
            <Instances range={pillars.length} receiveShadow>
                <boxGeometry args={[1.5, 0.4, 1.5]} />
                <meshStandardMaterial color="#2c3e50" />
                {pillars.map((p, i) => (
                    <Instance key={i} position={[p.position[0], 0.2, p.position[2]]} />
                ))}
            </Instances>

            {/* Ceiling Trusses (Upper Grid) */}
            <group position={[0, WAREHOUSE.HEIGHT - 2, 0]}>
                {/* Horizontal main beams */}
                {Array.from({ length: 11 }).map((_, i) => {
                    const z = WAREHOUSE.TOP_EDGE + 15 + i * 15;
                    return (
                        <mesh key={i} position={[0, 0, z]}>
                            <boxGeometry args={[WAREHOUSE.WIDTH, 0.4, 0.4]} />
                            <meshStandardMaterial color="#bdc3c7" transparent opacity={0.3} />
                        </mesh>
                    );
                })}
            </group>
        </group>
    );
};

export default StructuralElements;
