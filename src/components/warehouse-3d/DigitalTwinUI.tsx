import React, { useState, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useWarehouse3D } from './useWarehouse3D';

const ToggleButton: React.FC<{ label: string, active: boolean, onClick: () => void, color?: string }> = ({ label, active, onClick, color = "#3498db" }) => (
    <div
        onClick={onClick}
        style={{
            background: active ? color : 'rgba(255, 255, 255, 0.1)',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            transition: 'all 0.2s ease',
            color: active ? 'white' : 'rgba(255, 255, 255, 0.6)',
            border: active ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}
    >
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: active ? 'white' : 'rgba(255,255,255,0.2)' }} />
        {label}
    </div>
);

const DigitalTwinUI: React.FC = () => {
    const { showLabels, setShowLabels, showFlow, setShowFlow, showRealism, setShowRealism } = useWarehouse3D();
    const [throughput, setThroughput] = useState(1200);
    const [pickingRate, setPickingRate] = useState(350);
    const [occupancy] = useState(85);

    useEffect(() => {
        const interval = setInterval(() => {
            setThroughput(prev => Math.max(1000, Math.min(1500, prev + Math.floor(Math.random() * 50 - 25))));
            setPickingRate(prev => Math.max(300, Math.min(450, prev + Math.floor(Math.random() * 20 - 10))));
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <group>
            {/* --- Floating Control Panel --- */}
            <group position={[-140, 30, -70]}>
                <Html center transform distanceFactor={25} zIndexRange={[1000, 0]}>
                    <div style={{
                        background: 'rgba(0, 0, 0, 0.8)',
                        backdropFilter: 'blur(10px)',
                        padding: '20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        minWidth: '220px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        fontFamily: 'Inter, sans-serif'
                    }}>
                        <div style={{ color: 'white', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px', marginBottom: '4px', textAlign: 'center' }}>
                            SYSTEM OVERRIDE
                        </div>
                        <ToggleButton label="Labels (标签)" active={showLabels} onClick={() => setShowLabels(!showLabels)} color="#3498db" />
                        <ToggleButton label="Package Flow (货流)" active={showFlow} onClick={() => setShowFlow(!showFlow)} color="#2ecc71" />
                        <ToggleButton label="Industrial Aesthetics (现实增强)" active={showRealism} onClick={() => setShowRealism(!showRealism)} color="#e74c3c" />
                    </div>
                </Html>
            </group>

            {/* --- Data Cards --- */}
            {showLabels && (
                <>
                    <group position={[-15, 40, -10]}>
                        <Html center distanceFactor={25} zIndexRange={[1000, 0]} transform>
                            <DataCard title="立库利用率 (Occupancy)" value={occupancy} unit="%" color="#f1c40f" />
                        </Html>
                        <mesh position={[0, -15, 0]}>
                            <cylinderGeometry args={[0.2, 0.05, 30]} />
                            <meshBasicMaterial color="#f1c40f" transparent opacity={0.6} />
                        </mesh>
                    </group>

                    <group position={[30, 20, 0]}>
                        <Html center distanceFactor={25} zIndexRange={[1000, 0]} transform>
                            <DataCard title="分拣吞吐量 (Throughput)" value={throughput} unit="pcs/h" color="#2ecc71" />
                        </Html>
                        <mesh position={[0, -10, 0]}>
                            <cylinderGeometry args={[0.2, 0.05, 20]} />
                            <meshBasicMaterial color="#2ecc71" transparent opacity={0.6} />
                        </mesh>
                    </group>

                    <group position={[65, 25, 10]}>
                        <Html center distanceFactor={25} zIndexRange={[1000, 0]} transform>
                            <DataCard title="此区域作业效率 (Efficiency)" value={pickingRate} unit="lines/h" color="#e67e22" />
                        </Html>
                        <mesh position={[0, -10, 0]}>
                            <cylinderGeometry args={[0.2, 0.05, 20]} />
                            <meshBasicMaterial color="#e67e22" transparent opacity={0.6} />
                        </mesh>
                    </group>
                </>
            )}
        </group>
    );
};

// Internal Sub-component for data display
const DataCard: React.FC<{ title: string, value: string | number, unit: string, color?: string }> = ({ title, value, unit, color = "#3498db" }) => (
    <div style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        padding: '16px 24px',
        borderRadius: '12px',
        borderLeft: `6px solid ${color}`,
        color: 'white',
        fontFamily: 'Inter, system-ui, sans-serif',
        minWidth: '180px',
        textAlign: 'left',
        pointerEvents: 'none',
        userSelect: 'none',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)'
    }}>
        <div style={{ fontSize: '14px', textTransform: 'uppercase', opacity: 0.9, letterSpacing: '1px', fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1.1' }}>
            {value} <span style={{ fontSize: '16px', fontWeight: '500', opacity: 0.8 }}>{unit}</span>
        </div>
    </div>
);

export default DigitalTwinUI;
