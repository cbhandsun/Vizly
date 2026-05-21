import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { WAREHOUSE } from './constants';

// Interface for instance data
interface InstanceData {
    type: 'post' | 'beam' | 'pallet' | 'box';
    position: [number, number, number];
    scale: [number, number, number];
    color?: THREE.Color;
}

// Shared Geometries (Created once and reused across all renders)
const postGeo = new THREE.BoxGeometry(0.2, 1, 0.2); // Base height 1, scaled by instance
const beamGeo = new THREE.BoxGeometry(1, 0.1, 2.6); // Base length 1, scaled by instance
const palletGeo = new THREE.BoxGeometry(1.4, 0.15, 1.4);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// Shared Materials (Created once and reused across all renders)
const postMat = new THREE.MeshStandardMaterial({ color: "#34495e", metalness: 0.8 });
const beamMatHP = new THREE.MeshStandardMaterial({ color: WAREHOUSE.COLORS.RACKS_HIGH_BAY });
const beamMatMZ = new THREE.MeshStandardMaterial({ color: WAREHOUSE.COLORS.RACKS_MEZZANINE });
const palletMat = new THREE.MeshStandardMaterial({ color: "#8d6e63" });
const boxMat = new THREE.MeshStandardMaterial({ color: "#e67e22" });

const Racks: React.FC = () => {

    // Configuration for High Bay Racks
    const highBayConfig = useMemo<InstanceData[]>(() => {
        const instances: InstanceData[] = [];
        const count = 12;
        const spacing = 8;
        const startX = WAREHOUSE.HIGH_BAY_X[0];
        const length = WAREHOUSE.HIGH_BAY_X[1] - WAREHOUSE.HIGH_BAY_X[0];
        const zOffset = -50;
        const height = 18;
        const shelves = 6;

        for (let i = 0; i < count; i++) {
            const rackZ = zOffset + i * spacing;
            // Posts
            for (let zIdx = 0; zIdx < 2; zIdx++) {
                const z = rackZ + zIdx * 2.5 - 1.25;
                for (let xIdx = 0; xIdx < Math.ceil(length / 3) + 1; xIdx++) {
                    const x = startX + xIdx * 3;
                    instances.push({
                        type: 'post',
                        position: [x, height / 2, z],
                        scale: [1, height, 1]
                    });
                }
            }
            // Beams & Items
            const shelfHeight = height / shelves;
            const numSlots = Math.floor(length / 2);
            for (let sIdx = 0; sIdx < shelves; sIdx++) {
                const y = (sIdx + 1) * shelfHeight;
                // Beam
                instances.push({
                    type: 'beam',
                    position: [startX + length / 2, y, rackZ],
                    scale: [length, 1, 1]
                });

                // Items
                for (let xIdx = 0; xIdx < numSlots; xIdx++) {
                    const x = startX + xIdx * 2 + 1;
                    if (Math.random() > 0.1) {
                        instances.push({
                            type: 'pallet',
                            position: [x, y - 0.5 + 0.1, rackZ],
                            scale: [1, 1, 1]
                        });
                        const boxW = 1.2 + Math.random() * 0.2;
                        const boxH = 0.8 + Math.random() * 0.4;
                        const boxD = 1.2 + Math.random() * 0.2;
                        instances.push({
                            type: 'box',
                            position: [x, y - 0.5 + 0.15 + boxH / 2, rackZ],
                            scale: [boxW, boxH, boxD],
                            color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5)
                        });
                    }
                }
            }
        }
        return instances;
    }, []);

    // Configuration for Mezzanine Racks
    const mezzanineConfig = useMemo<InstanceData[]>(() => {
        const instances: InstanceData[] = [];
        const blocks = [
            { count: 4, startX: WAREHOUSE.MEZZANINE_X[0], zOffset: -60, spacing: 6, length: 20, height: 10, shelves: 4 },
            { count: 4, startX: WAREHOUSE.MEZZANINE_X[0] + 25, zOffset: -60, spacing: 6, length: 20, height: 10, shelves: 4 },
            { count: 4, startX: WAREHOUSE.MEZZANINE_X[0], zOffset: -20, spacing: 6, length: 45, height: 10, shelves: 4 }
        ];

        blocks.forEach(block => {
            for (let i = 0; i < block.count; i++) {
                const rackZ = block.zOffset + i * block.spacing;
                // Posts
                for (let zIdx = 0; zIdx < 2; zIdx++) {
                    const z = rackZ + zIdx * 2.5 - 1.25;
                    for (let xIdx = 0; xIdx < Math.ceil(block.length / 3) + 1; xIdx++) {
                        const x = block.startX + xIdx * 3;
                        instances.push({
                            type: 'post',
                            position: [x, block.height / 2, z],
                            scale: [1, block.height, 1]
                        });
                    }
                }
                // Beams & Items
                const shelfHeight = block.height / block.shelves;
                const numSlots = Math.floor(block.length / 2);
                for (let sIdx = 0; sIdx < block.shelves; sIdx++) {
                    const y = (sIdx + 1) * shelfHeight;
                    // Beam
                    instances.push({
                        type: 'beam',
                        position: [block.startX + block.length / 2, y, rackZ],
                        scale: [block.length, 1, 1]
                    });
                    // Items
                    for (let xIdx = 0; xIdx < numSlots; xIdx++) {
                        const x = block.startX + xIdx * 2 + 1;
                        if (Math.random() > 0.1) {
                            instances.push({
                                type: 'pallet',
                                position: [x, y - 0.5 + 0.1, rackZ],
                                scale: [1, 1, 1]
                            });
                            const boxW = 1.2 + Math.random() * 0.2;
                            const boxH = 0.8 + Math.random() * 0.4;
                            const boxD = 1.2 + Math.random() * 0.2;
                            instances.push({
                                type: 'box',
                                position: [x, y - 0.5 + 0.15 + boxH / 2, rackZ],
                                scale: [boxW, boxH, boxD],
                                color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5)
                            });
                        }
                    }
                }
            }
        });
        return instances;
    }, []);

    // Helper to filter and render instances
    const RenderInstances = ({ data, type, colorProp = false }: { data: InstanceData[], type: string, colorProp?: boolean }) => (
        <>
            {data.filter(d => d.type === type).map((d, i) => (
                <Instance
                    key={i}
                    position={d.position}
                    scale={d.scale}
                    color={colorProp ? d.color : undefined}
                />
            ))}
        </>
    );

    return (
        <group>
            {/* 1. POSTS */}
            <Instances range={5000} geometry={postGeo} material={postMat} castShadow receiveShadow>
                <RenderInstances data={highBayConfig} type="post" />
                <RenderInstances data={mezzanineConfig} type="post" />
            </Instances>

            {/* 2. BEAMS (High Bay) */}
            <Instances range={2000} geometry={beamGeo} material={beamMatHP} castShadow receiveShadow>
                <RenderInstances data={highBayConfig} type="beam" />
            </Instances>

            {/* 3. BEAMS (Mezzanine) */}
            <Instances range={2000} geometry={beamGeo} material={beamMatMZ} castShadow receiveShadow>
                <RenderInstances data={mezzanineConfig} type="beam" />
            </Instances>

            {/* 4. PALLETS */}
            <Instances range={5000} geometry={palletGeo} material={palletMat} castShadow receiveShadow>
                <RenderInstances data={highBayConfig} type="pallet" />
                <RenderInstances data={mezzanineConfig} type="pallet" />
            </Instances>

            {/* 5. BOXES */}
            <Instances range={5000} geometry={boxGeo} material={boxMat} castShadow receiveShadow>
                <RenderInstances data={highBayConfig} type="box" colorProp />
                <RenderInstances data={mezzanineConfig} type="box" colorProp />
            </Instances>
        </group>
    );
};

export default Racks;
