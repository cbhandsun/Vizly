import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface WarehouseInstanceSpec {
    position: [number, number, number];
    scale?: [number, number, number];
    rotation?: [number, number, number];
    color?: THREE.ColorRepresentation | THREE.Color;
}

export interface WarehouseInstancedMeshProps {
    instances: readonly WarehouseInstanceSpec[];
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    castShadow?: boolean;
    receiveShadow?: boolean;
    capacity?: number;
}

const matrixObject = new THREE.Object3D();

/**
 * Narrow warehouse-only replacement for drei's generic Instances/Instance pair.
 * The scene only needs static transforms plus optional per-instance colors, so
 * using Three's native InstancedMesh avoids shipping the broader helper stack.
 */
export const WarehouseInstancedMesh: React.FC<WarehouseInstancedMeshProps> = ({
    instances,
    geometry,
    material,
    castShadow = false,
    receiveShadow = false,
    capacity,
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const color = useMemo(() => new THREE.Color(), []);
    const count = Math.max(1, capacity ?? instances.length);

    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        mesh.count = instances.length;
        instances.forEach((instance, index) => {
            matrixObject.position.set(...instance.position);
            matrixObject.rotation.set(...(instance.rotation ?? [0, 0, 0]));
            matrixObject.scale.set(...(instance.scale ?? [1, 1, 1]));
            matrixObject.updateMatrix();
            mesh.setMatrixAt(index, matrixObject.matrix);
            if (instance.color !== undefined) {
                color.set(instance.color);
                mesh.setColorAt(index, color);
            }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    }, [color, instances]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, count]}
            castShadow={castShadow}
            receiveShadow={receiveShadow}
        />
    );
};

export default WarehouseInstancedMesh;
