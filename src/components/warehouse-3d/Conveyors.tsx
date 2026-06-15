import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Instances, Instance } from '@react-three/drei';
import { WAREHOUSE } from './constants';
import { useWarehouse3D } from './useWarehouse3D';

// --- Shared Optimization Helpers ---
const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

const PALETTES = {
    CARDBOARD: ["#e3a661", "#d49a5b", "#f5c491", "#ffdbb5", "#c4884d"],
    AUTOMATED: ["#2980b9", "#3498db", "#00d2ff", "#74b9ff", "#0984e3"],
    MANUAL: ["#e67e22", "#f39c12", "#e17055", "#fdcb6e", "#fab1a0"]
};

const deterministicUnit = (seed: number): number => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
};

const getThemeColor = (palette: keyof typeof PALETTES, index = 0) => {
    const colors = PALETTES[palette];
    return colors[index % colors.length];
};

// --- Static Structure ---

const ConveyorSegment: React.FC<{
    position: [number, number, number],
    size: [number, number, number],
    rotation?: [number, number, number],
    transparent?: boolean
}> = ({ position, size, rotation = [0, 0, 0], transparent = false }) => {
    return (
        <group position={position} rotation={rotation}>
            <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[size[0], size[1], size[2]]} />
                <meshStandardMaterial
                    color={WAREHOUSE.COLORS.CONVEYOR}
                    metalness={0.5}
                    roughness={0.3}
                    transparent={transparent}
                    opacity={transparent ? 0.3 : 1}
                />
            </mesh>
            {/* Rails are instanced in parents now for performance, 
                but keeping these simple ones for unique segments */}
            <mesh position={[0, size[1] / 2 + 0.2, size[2] / 2 + 0.1]}>
                <boxGeometry args={[size[0], 0.5, 0.2]} />
                <meshStandardMaterial color="#34495e" transparent={transparent} opacity={transparent ? 0.3 : 1} />
            </mesh>
            <mesh position={[0, size[1] / 2 + 0.2, -size[2] / 2 - 0.1]}>
                <boxGeometry args={[size[0], 0.5, 0.2]} />
                <meshStandardMaterial color="#34495e" transparent={transparent} opacity={transparent ? 0.3 : 1} />
            </mesh>
            {/* Rollers */}
            <mesh position={[0, size[1] / 2 + 0.05, 0]}>
                <boxGeometry args={[size[0] - 0.2, 0.1, size[2] - 0.1]} />
                <meshStandardMaterial color="#7f8c8d" transparent={transparent} opacity={transparent ? 0.5 : 1} />
            </mesh>
        </group>
    );
};

// --- Industrial Polish Components ---

const ScannerLaser: React.FC<{ position: [number, number, number], rotation?: [number, number, number], scale?: [number, number, number], color?: string }> = ({ position, rotation = [0, 0, 0], scale = [1, 1, 1], color = "#e74c3c" }) => {
    const laserRef = useRef<THREE.Mesh>(null);
    
    useFrame(({ clock }) => {
        if (!laserRef.current) return;
        const t = clock.getElapsedTime() * 2;
        laserRef.current.scale.x = (0.9 + Math.sin(t * 5) * 0.1) * scale[0];
        laserRef.current.position.y = (Math.sin(t * 2) * 2) * scale[1];
    });

    return (
        <group position={position} rotation={rotation}>
            <mesh ref={laserRef}>
                <planeGeometry args={[1, 7]} />
                <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
            </mesh>
            <mesh scale={[1.1, 1, 1.1]}>
                <planeGeometry args={[1.2, 7]} />
                <meshBasicMaterial color={color} transparent opacity={0.1} side={THREE.DoubleSide} />
            </mesh>
            <pointLight distance={5} intensity={5} color={color} />
        </group>
    );
};

// --- Dynamic Simulation (Optimized with Centralized useFrame) ---

const AnimatedPackages: React.FC = () => {
    const { showFlow } = useWarehouse3D();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const packageCount = 120;
    const height = 5.1;

    const { colors, initialScales } = useMemo(() => {
        const cArray = new Float32Array(packageCount * 3);
        const sArray = new Float32Array(packageCount * 3);
        for (let i = 0; i < packageCount; i++) {
            const theme = i % 15 < 5 ? 'CARDBOARD' : (i % 15 < 10 ? 'AUTOMATED' : 'MANUAL');
            tempColor.set(getThemeColor(theme, i));
            tempColor.toArray(cArray, i * 3);
            sArray[i * 3] = 1.3 + deterministicUnit(i + 1) * 0.2;
            sArray[i * 3 + 1] = 0.8 + deterministicUnit(i + 101) * 0.4;
            sArray[i * 3 + 2] = 1.3 + deterministicUnit(i + 201) * 0.2;
        }
        return { colors: cArray, initialScales: sArray };
    }, []);

    useFrame(({ clock }) => {
        if (!meshRef.current || !showFlow) return;
        const time = clock.getElapsedTime();
        const speed = 8;
        const pathPeriod = 244;

        for (let i = 0; i < packageCount; i++) {
            const t = (time * speed + i * (pathPeriod / packageCount)) % pathPeriod;
            let x: number;
            let z: number;
            let rotation: number;
            if (t < 100) { x = 7; z = 50 - t; rotation = 0; }
            else if (t < 122) { const turnT = (t - 100) / 22; const angle = turnT * Math.PI; x = Math.cos(angle) * 7; z = -50 - Math.sin(angle) * 7; rotation = angle; }
            else if (t < 222) { const segT = t - 122; x = -7; z = -50 + segT; rotation = Math.PI; }
            else { const turnT = (t - 222) / 22; const angle = Math.PI + turnT * Math.PI; x = Math.cos(angle) * 7; z = 50 - Math.sin(angle) * 7; rotation = angle; }
            
            tempObject.position.set(x, height, z);
            tempObject.rotation.set(0, rotation, 0);
            tempObject.scale.set(initialScales[i*3], initialScales[i*3+1], initialScales[i*3+2]);
            tempObject.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObject.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    if (!showFlow) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, packageCount]} castShadow>
            <boxGeometry args={[1, 1, 1]}>
                <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
            </boxGeometry>
            <meshStandardMaterial vertexColors metalness={0.1} roughness={0.5} />
        </instancedMesh>
    );
};

const SorterPackages: React.FC = () => {
    const { showFlow } = useWarehouse3D();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const chuteCount = 12;
    const totalCount = chuteCount * 5;

    const { colors } = useMemo(() => {
        const cArray = new Float32Array(totalCount * 3);
        const palettes: (keyof typeof PALETTES)[] = ['CARDBOARD', 'AUTOMATED', 'MANUAL'];
        for (let i = 0; i < totalCount; i++) {
            const theme = palettes[i % 3];
            tempColor.set(getThemeColor(theme, i));
            tempColor.toArray(cArray, i * 3);
        }
        return { colors: cArray };
    }, [totalCount]);

    useFrame(({ clock }) => {
        if (!meshRef.current || !showFlow) return;
        const time = clock.getElapsedTime();
        const speed = 8;
        const pathPeriod = 30;

        for (let chuteIdx = 0; chuteIdx < 5; chuteIdx++) {
            const zOff = -30 + chuteIdx * 15;
            for (let i = 0; i < chuteCount; i++) {
                const idx = chuteIdx * chuteCount + i;
                const t = (time * speed + i * (pathPeriod / chuteCount)) % pathPeriod;
                const tCycle = t % 30;
                let x = 7 + tCycle, y = 5.1;
                if (tCycle > 5) y = 5.1 - ((tCycle - 5) * 0.2);
                if (x > 31) x = 31;
                if (y < 1) y = 1;
                
                tempObject.position.set(x, y, zOff);
                tempObject.rotation.set(0, 0, 0);
                tempObject.scale.set(1.4, 0.9, 1.4);
                tempObject.updateMatrix();
                meshRef.current.setMatrixAt(idx, tempObject.matrix);
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    if (!showFlow) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, totalCount]} castShadow>
            <boxGeometry args={[1, 1, 1]}>
                <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
            </boxGeometry>
            <meshStandardMaterial vertexColors metalness={0.1} roughness={0.5} />
        </instancedMesh>
    );
};

const RetrievalPackages: React.FC = () => {
    const { showFlow } = useWarehouse3D();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 50;
    const xCenter = WAREHOUSE.CONVEYOR_X[0] + (WAREHOUSE.CONVEYOR_X[1] - WAREHOUSE.CONVEYOR_X[0]) / 2;
    const rightRailX = xCenter + 7;

    const { colors } = useMemo(() => {
        const cArray = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            tempColor.set(getThemeColor('AUTOMATED', i));
            tempColor.toArray(cArray, i * 3);
        }
        return { colors: cArray };
    }, []);

    useFrame(({ clock }) => {
        if (!meshRef.current || !showFlow) return;
        const time = clock.getElapsedTime();
        const speed = 8;
        const pathPeriod = 307;

        for (let i = 0; i < count; i++) {
            const t = (time * speed + i * (pathPeriod / count)) % pathPeriod;
            let x = -130 + t, y = 7.55, z = 62, rotation = 0;
            if (x > rightRailX) {
                const mergeDist = x - rightRailX;
                x = rightRailX;
                z = Math.max(0, 62 - mergeDist);
                if (z < 15 && z > 0) {
                    const mergeT = 1 - (z / 15);
                    const sCurve = Math.sin((mergeT - 0.5) * Math.PI) * 0.5 + 0.5;
                    x += sCurve * 1.5;
                    rotation = mergeT * 0.1;
                }
            }
            if (z >= 0 && z <= 62) {
                const dropProgress = (62 - z) / 62;
                y = 7.55 - dropProgress * (7.55 - 5.1);
            } else if (z < 0) y = 5.1;

            tempObject.position.set(x, y, z);
            tempObject.rotation.set(0, rotation, 0);
            tempObject.scale.set(1.4, 0.9, 1.4);
            tempObject.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObject.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    if (!showFlow) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
            <boxGeometry args={[1, 1, 1]}>
                <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
            </boxGeometry>
            <meshStandardMaterial vertexColors metalness={0.1} roughness={0.5} />
        </instancedMesh>
    );
};

const InboundPackages: React.FC = () => {
    const { showFlow } = useWarehouse3D();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 30;

    const { colors } = useMemo(() => {
        const cArray = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            tempColor.set(getThemeColor('MANUAL', i));
            tempColor.toArray(cArray, i * 3);
        }
        return { colors: cArray };
    }, []);

    useFrame(({ clock }) => {
        if (!meshRef.current || !showFlow) return;
        const time = clock.getElapsedTime();
        const speed = 8;
        const pathPeriod = 53;

        for (let i = 0; i < count; i++) {
            const t = (time * speed + i * (pathPeriod / count)) % pathPeriod;
            const x = -60 + t;
            const y = 5.1;
            let z = 0;
            let rotation = 0;
            if (t > 40) {
                const curveT = (t - 40) / 13;
                const smoothT = Math.sin((curveT - 0.5) * Math.PI) * 0.5 + 0.5;
                z = -smoothT * 7;
                rotation = smoothT * (-Math.PI / 12);
            }
            
            tempObject.position.set(x, y, z);
            tempObject.rotation.set(0, rotation, 0);
            tempObject.scale.set(1.4, 0.9, 1.4);
            tempObject.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObject.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    if (!showFlow) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
            <boxGeometry args={[1, 1, 1]}>
                <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
            </boxGeometry>
            <meshStandardMaterial vertexColors metalness={0.1} roughness={0.5} />
        </instancedMesh>
    );
};

const PalletStacks: React.FC = () => {
    const { showFlow } = useWarehouse3D();
    if (!showFlow) return null;
    return (
        <group>
            {Array.from({ length: 5 }).map((_, i) => {
                const z = -30 + i * 15;
                const color1 = PALETTES.CARDBOARD[i % PALETTES.CARDBOARD.length];
                const color2 = PALETTES.AUTOMATED[i % PALETTES.AUTOMATED.length];
                const color3 = PALETTES.MANUAL[i % PALETTES.MANUAL.length];
                return (
                    <group key={i} position={[28, 0, z]}>
                        <mesh position={[0, 0.1, 0]}><boxGeometry args={[1.2, 0.2, 1.2]} /><meshStandardMaterial color="#A0522D" /></mesh>
                        <mesh position={[0, 0.7, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={color1} /></mesh>
                        <group position={[1.5, 0, 0.5]}>
                            <mesh position={[0, 0.1, 0]}><boxGeometry args={[1.2, 0.2, 1.2]} /><meshStandardMaterial color="#A0522D" /></mesh>
                            <mesh position={[0, 0.7, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={i % 2 === 0 ? color2 : color3} /></mesh>
                        </group>
                    </group>
                );
            })}
        </group>
    );
};

const Conveyors: React.FC = () => {
    const { showRealism, showFlow } = useWarehouse3D();
    const xCenter = WAREHOUSE.CONVEYOR_X[0] + (WAREHOUSE.CONVEYOR_X[1] - WAREHOUSE.CONVEYOR_X[0]) / 2;
    const height = 4, loopDepth = 100;

    return (
        <group>
            {/* Main Loop Infrastructure */}
            <group position={[xCenter, 0, 0]}>
                <ConveyorSegment position={[-7, 0, 0]} size={[4, height, loopDepth]} transparent={true} />
                <ConveyorSegment position={[7, 0, 0]} size={[4, height, loopDepth]} transparent={true} />
                <ConveyorSegment position={[0, 0, -loopDepth / 2]} size={[18, height, 4]} transparent={true} />
                <ConveyorSegment position={[0, 0, loopDepth / 2]} size={[18, height, 4]} transparent={true} />

                {/* Rails */}
                <mesh position={[9.1, 2.5, 0]}><boxGeometry args={[0.2, 5, loopDepth]} /><meshStandardMaterial color="#2c3e50" /></mesh>
                <mesh position={[-9.1, 2.5, 0]}><boxGeometry args={[0.2, 5, loopDepth]} /><meshStandardMaterial color="#2c3e50" /></mesh>

                {/* Outbound Chutes */}
                {Array.from({ length: 5 }).map((_, i) => {
                    const zPos = -30 + i * 15;
                    return (
                        <group key={i}>
                            <ConveyorSegment position={[16, 1, zPos]} size={[15, 2, 3]} rotation={[0, 0, -0.1]} transparent={true} />
                            <mesh position={[9.5, 2.5, zPos]} rotation={[0, -Math.PI / 6, 0]}><boxGeometry args={[4, 1.2, 0.2]} /><meshStandardMaterial color="#2c3e50" /></mesh>
                            <mesh position={[8.5, 2.1, zPos]}><boxGeometry args={[2, 0.1, 3.5]} /><meshStandardMaterial color="#7f8c8d" /></mesh>
                        </group>
                    );
                })}

                {/* Main Induction Tunnel */}
                <group position={[7, 4, 30]}>
                    <mesh castShadow><boxGeometry args={[6, 8, 4]} /><meshStandardMaterial color="#34495e" opacity={0.8} transparent /></mesh>
                    <mesh><boxGeometry args={[5, 7, 4.2]} /><meshStandardMaterial color="#000000" /></mesh>
                    <pointLight position={[0, 3, 0]} color="#3498db" intensity={2} distance={10} />
                    {showRealism && showFlow && <ScannerLaser position={[0, 0, 0]} />}
                </group>

                {/* ASRS Interaction Tunnel */}
                <group position={[-32.5, 3, 0]}>
                    <mesh><boxGeometry args={[4, 10, 6]} /><meshStandardMaterial color="#34495e" /></mesh>
                    {showRealism && showFlow && <ScannerLaser position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={[1.4, 1, 1]} />}
                </group>
            </group>

            {/* Inbound Lines (Mezzanine & High Bay) */}
            <group position={[xCenter - 32.5, 0, 0]}>
                <ConveyorSegment position={[0, 0, 0]} size={[55, height, 4]} />
                <mesh position={[-25, 3, 0]}><boxGeometry args={[4, 10, 6]} /><meshStandardMaterial color="#34495e" /></mesh>
                <mesh position={[25.5, 2.5, 2.5]} rotation={[0, -Math.PI / 4, 0]}><boxGeometry args={[5, 1, 0.2]} /><meshStandardMaterial color="#2c3e50" /></mesh>
                <mesh position={[18, 2.5, -2.5]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[5, 1, 0.2]} /><meshStandardMaterial color="#2c3e50" /></mesh>
            </group>

            {/* High Bay Retrieval Line (ASRS to Sorter) */}
            <group>
                {Array.from({ length: 12 }).map((_, i) => {
                    const width = 70;
                    const aisleX = (i - 6) * (width / 13) + 2;
                    const absX = -15 + aisleX;
                    return (
                        <group key={i}>
                            <ConveyorSegment position={[absX, 0, 56.75]} size={[1.2, 2, 9.5]} />
                            <mesh position={[absX, 3, 62]}><boxGeometry args={[1.6, 6, 1.6]} /><meshStandardMaterial color="#95a5a6" opacity={0.6} transparent /></mesh>
                        </group>
                    );
                })}
                <ConveyorSegment position={[-52.5, 6, 62]} size={[155, 1, 3]} transparent={true} />
                <mesh position={[-130, 6, 62]}><boxGeometry args={[8, 4, 8]} /><meshStandardMaterial color="#2c3e50" /></mesh>
                <ConveyorSegment position={[60, 6, 62]} size={[90, 1, 3]} transparent={true} />
                {/* Optimized Static Supports */}
                <Instances range={17} receiveShadow>
                     <cylinderGeometry args={[0.3, 0.3, 6, 8]} />
                     <meshStandardMaterial color="#95a5a6" />
                     {[-130, -115, -100, -85, -70, -55, -40, -25, -10, 5, 20, 35, 50, 65, 80, 95, 110].map((x, i) => (
                         <Instance key={i} position={[x, 3, 62]} />
                     ))}
                </Instances>
                
                {/* Downward Ramp to Sorter induction */}
                <group position={[xCenter + 7, 0, 0]}>
                    <ConveyorSegment position={[0, 6.325, 31]} size={[3, 1, 62]} rotation={[Math.atan2(7.55 - 5.1, 62), 0, 0]} transparent={true} />
                    <mesh position={[0, 5.1, 0]}><boxGeometry args={[4, 0.2, 4]} /><meshStandardMaterial color="#7f8c8d" /></mesh>
                    <mesh position={[2, 6, 10]}><boxGeometry args={[0.2, 2, 20]} /><meshStandardMaterial color="#2c3e50" /></mesh>
                    <mesh position={[-2, 6, 10]}><boxGeometry args={[0.2, 2, 20]} /><meshStandardMaterial color="#2c3e50" /></mesh>
                </group>
            </group>

            {/* Dynamic Content */}
            <group position={[xCenter, 0, 0]}>
                <AnimatedPackages />
                <SorterPackages />
                <InboundPackages />
                <PalletStacks />
            </group>
            <RetrievalPackages />
        </group>
    );
};

export default Conveyors;
