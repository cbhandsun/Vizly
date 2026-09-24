import React, { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getWarehouseHtmlOverlayFrameStyle } from './WarehouseHtmlOverlayProjection';

const setWarehouseCanvasImageRendering = (element: HTMLCanvasElement, imageRendering: string) => {
    element.style.imageRendering = imageRendering;
};

const configureWarehouseOrbitControls = (
    controls: ThreeOrbitControls,
    config: {
        minPolarAngle: number;
        maxPolarAngle: number;
        minDistance: number;
        maxDistance: number;
        enableDamping: boolean;
        autoRotate: boolean;
        autoRotateSpeed: number;
    },
) => {
    controls.minPolarAngle = config.minPolarAngle;
    controls.maxPolarAngle = config.maxPolarAngle;
    controls.minDistance = config.minDistance;
    controls.maxDistance = config.maxDistance;
    controls.enableDamping = config.enableDamping;
    controls.autoRotate = config.autoRotate;
    controls.autoRotateSpeed = config.autoRotateSpeed;
};

export const WarehouseAdaptiveDpr: React.FC<{ pixelated?: boolean }> = ({ pixelated = false }) => {
    const gl = useThree(state => state.gl);
    const active = useThree(state => state.internal.active);
    const current = useThree(state => state.performance.current);
    const initialDpr = useThree(state => state.viewport.initialDpr);
    const setDpr = useThree(state => state.setDpr);

    useEffect(() => {
        const domElement = gl.domElement;
        return () => {
            if (active) setDpr(initialDpr);
            if (pixelated && domElement) setWarehouseCanvasImageRendering(domElement, 'auto');
        };
    }, [active, gl.domElement, initialDpr, pixelated, setDpr]);

    useEffect(() => {
        setDpr(current * initialDpr);
        if (pixelated && gl.domElement) {
            setWarehouseCanvasImageRendering(gl.domElement, current === 1 ? 'auto' : 'pixelated');
        }
    }, [current, gl.domElement, initialDpr, pixelated, setDpr]);

    return null;
};

/**
 * Lightweight decorative floor contact shade for the warehouse scene.
 *
 * Drei's ContactShadows renders depth into offscreen targets and pulls shader
 * helpers. This static industrial overview already has real directional-light
 * shadows, so a broad translucent ground disk keeps depth cues without the
 * extra render-target dependency.
 */
export const WarehouseGroundShadow: React.FC = () => (
    <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <circleGeometry args={[250, 96]} />
        <meshBasicMaterial color="#1a1a1a" transparent opacity={0.16} depthWrite={false} />
    </mesh>
);

export interface WarehouseOrbitControlsHandle {
    reset: () => void;
    update: () => void;
    getAzimuthalAngle: () => number;
    setAzimuthalAngle: (angle: number) => void;
    getPolarAngle: () => number;
    setPolarAngle: (angle: number) => void;
    dollyIn: (scale?: number) => void;
    dollyOut: (scale?: number) => void;
}

export interface WarehouseOrbitControlsProps {
    minPolarAngle: number;
    maxPolarAngle: number;
    minDistance: number;
    maxDistance: number;
    enableDamping?: boolean;
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    onStart?: () => void;
}

export const WarehouseOrbitControls = React.forwardRef<WarehouseOrbitControlsHandle, WarehouseOrbitControlsProps>(({
    minPolarAngle,
    maxPolarAngle,
    minDistance,
    maxDistance,
    enableDamping = false,
    autoRotate = false,
    autoRotateSpeed = 0.5,
    onStart,
}, ref) => {
    const camera = useThree(state => state.camera);
    const gl = useThree(state => state.gl);
    const invalidate = useThree(state => state.invalidate);
    const controls = useMemo(() => new ThreeOrbitControls(camera, gl.domElement), [camera, gl.domElement]);

    useImperativeHandle(ref, () => {
        const setOrbitAngle = (next: { azimuthal?: number; polar?: number }) => {
            const offset = camera.position.clone().sub(controls.target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            if (next.azimuthal !== undefined) spherical.theta = next.azimuthal;
            if (next.polar !== undefined) spherical.phi = next.polar;
            spherical.phi = Math.min(maxPolarAngle, Math.max(minPolarAngle, spherical.phi));
            spherical.makeSafe();
            camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
            controls.update();
            invalidate();
        };

        return {
            reset: () => controls.reset(),
            update: () => controls.update(),
            getAzimuthalAngle: () => controls.getAzimuthalAngle(),
            setAzimuthalAngle: (angle: number) => setOrbitAngle({ azimuthal: angle }),
            getPolarAngle: () => controls.getPolarAngle(),
            setPolarAngle: (angle: number) => setOrbitAngle({ polar: angle }),
            dollyIn: (scale?: number) => controls.dollyIn(scale ?? 1),
            dollyOut: (scale?: number) => controls.dollyOut(scale ?? 1),
        };
    }, [camera.position, controls, invalidate, maxPolarAngle, minPolarAngle]);

    useEffect(() => {
        configureWarehouseOrbitControls(controls, {
            minPolarAngle,
            maxPolarAngle,
            minDistance,
            maxDistance,
            enableDamping,
            autoRotate,
            autoRotateSpeed,
        });
        controls.update();
        invalidate();
    }, [
        autoRotate,
        autoRotateSpeed,
        controls,
        enableDamping,
        invalidate,
        maxDistance,
        maxPolarAngle,
        minDistance,
        minPolarAngle,
    ]);

    useEffect(() => {
        const handleStart = () => onStart?.();
        const handleChange = () => invalidate();
        controls.addEventListener('start', handleStart);
        controls.addEventListener('change', handleChange);
        return () => {
            controls.removeEventListener('start', handleStart);
            controls.removeEventListener('change', handleChange);
        };
    }, [controls, invalidate, onStart]);

    useEffect(() => () => controls.dispose(), [controls]);

    useFrame(() => {
        if (controls.enabled && (controls.enableDamping || controls.autoRotate)) {
            controls.update();
        }
    });

    return null;
});

WarehouseOrbitControls.displayName = 'WarehouseOrbitControls';


export interface WarehouseHtmlOverlayProps {
    children: React.ReactNode;
    center?: boolean;
    distanceFactor?: number;
    pointerEvents?: React.CSSProperties['pointerEvents'];
    position?: [number, number, number];
    zIndexRange?: readonly [number, number];
}

const ensureOverlayHost = (canvas: HTMLCanvasElement): HTMLElement => {
    const host = canvas.parentElement ?? canvas.ownerDocument.body;
    if (host instanceof HTMLElement) {
        const style = canvas.ownerDocument.defaultView?.getComputedStyle(host);
        if (!style || style.position === 'static') {
            host.style.position = 'relative';
        }
        return host;
    }
    return canvas.ownerDocument.body;
};

export const WarehouseHtmlOverlay: React.FC<WarehouseHtmlOverlayProps> = ({
    children,
    center = false,
    distanceFactor,
    pointerEvents = 'auto',
    position,
    zIndexRange,
}) => {
    const groupRef = useRef<THREE.Group>(null);
    const elementRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<Root | null>(null);
    const worldPosition = useMemo(() => new THREE.Vector3(), []);
    const projectedPosition = useMemo(() => new THREE.Vector3(), []);

    const camera = useThree(state => state.camera);
    const gl = useThree(state => state.gl);
    const size = useThree(state => state.size);

    useEffect(() => {
        const ownerDocument = gl.domElement.ownerDocument;
        const element = ownerDocument.createElement('div');
        element.style.position = 'absolute';
        element.style.top = '0';
        element.style.left = '0';
        element.style.pointerEvents = pointerEvents ?? 'auto';
        element.style.transformOrigin = center ? 'center center' : 'top left';
        element.style.willChange = 'transform';
        element.setAttribute('data-warehouse-html-overlay', 'true');

        ensureOverlayHost(gl.domElement).appendChild(element);
        elementRef.current = element;
        rootRef.current = createRoot(element);
        rootRef.current.render(<>{children}</>);

        return () => {
            rootRef.current?.unmount();
            rootRef.current = null;
            element.remove();
            elementRef.current = null;
        };
    }, [center, children, gl.domElement, pointerEvents]);

    useEffect(() => {
        rootRef.current?.render(<>{children}</>);
    }, [children]);

    useFrame(() => {
        const element = elementRef.current;
        const group = groupRef.current;
        if (!element || !group) return;

        group.getWorldPosition(worldPosition);
        projectedPosition.copy(worldPosition).project(camera);
        const style = getWarehouseHtmlOverlayFrameStyle({
            projectedX: projectedPosition.x,
            projectedY: projectedPosition.y,
            projectedZ: projectedPosition.z,
            viewportWidth: size.width,
            viewportHeight: size.height,
            center,
            distanceFactor,
            cameraDistance: camera.position.distanceTo(worldPosition),
            zIndexRange,
        });
        element.style.display = style.display;
        element.style.transform = style.transform;
        element.style.zIndex = style.zIndex;
    });

    return <group ref={groupRef} position={position} />;
};
