import React from 'react';
import { WAREHOUSE } from './constants';

const LineStrip: React.FC<{ start: [number, number, number], end: [number, number, number], width?: number }> = ({ start, end, width = 0.5 }) => {
    // Simple rectangular mesh between two points
    const dx = end[0] - start[0];
    const dz = end[2] - start[2];
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    const midX = (start[0] + end[0]) / 2;
    const midZ = (start[2] + end[2]) / 2;

    return (
        <mesh
            position={[midX, 0.03, midZ]} // Raise slightly above floor (+0.03) to avoid Z-fighting with floor (+0.0) and shadows (+0.02)
            rotation={[-Math.PI / 2, 0, -angle]}
            receiveShadow
        >
            <planeGeometry args={[length, width]} />
            <meshStandardMaterial color="#f1c40f" roughness={0.5} />
        </mesh>
    );
};

const FloorMarkings: React.FC = () => {
    return (
        <group>
            {/* Main Aisle Logic */}
            {/* Horizontal line dividing high bay and packing */}
            <LineStrip start={[-130, 0, 0]} end={[130, 0, 0]} width={1} />

            {/* Vertical line separating Inbound and High Bay */}
            <LineStrip start={[WAREHOUSE.INBOUND_AREA_X + 20, 0, -80]} end={[WAREHOUSE.INBOUND_AREA_X + 20, 0, 80]} width={0.8} />

            {/* Vertical line separating High Bay and AS/RS */}
            <LineStrip start={[-20, 0, -80]} end={[-20, 0, 80]} width={0.8} />

            {/* Vertical line separating AS/RS and Picking */}
            <LineStrip start={[20, 0, -80]} end={[20, 0, 80]} width={0.8} />

            {/* Vertical line separating Picking and Sorting */}
            <LineStrip start={[80, 0, -80]} end={[80, 0, 80]} width={0.8} />

            {/* Dock Safe Zones */}
            {/* Left Docks */}
            <LineStrip start={[WAREHOUSE.LEFT_EDGE + 20, 0, -60]} end={[WAREHOUSE.LEFT_EDGE + 20, 0, 60]} width={0.5} />
            {/* Right Docks */}
            <LineStrip start={[WAREHOUSE.RIGHT_EDGE - 20, 0, -60]} end={[WAREHOUSE.RIGHT_EDGE - 20, 0, 60]} width={0.5} />
        </group>
    );
};

export default FloorMarkings;
