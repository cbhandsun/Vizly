export interface WarehouseHtmlOverlayFrameStyleInput {
    projectedX: number;
    projectedY: number;
    projectedZ: number;
    viewportWidth: number;
    viewportHeight: number;
    center: boolean;
    distanceFactor?: number;
    cameraDistance: number;
    zIndexRange?: readonly [number, number];
}

export interface WarehouseHtmlOverlayFrameStyle {
    display: 'none' | 'block';
    transform: string;
    zIndex: string;
}

export const getWarehouseHtmlOverlayFrameStyle = ({
    projectedX,
    projectedY,
    projectedZ,
    viewportWidth,
    viewportHeight,
    center,
    distanceFactor,
    cameraDistance,
    zIndexRange,
}: WarehouseHtmlOverlayFrameStyleInput): WarehouseHtmlOverlayFrameStyle => {
    const visible = projectedZ >= -1 && projectedZ <= 1;
    const screenX = (projectedX * 0.5 + 0.5) * viewportWidth;
    const screenY = (-projectedY * 0.5 + 0.5) * viewportHeight;
    const anchor = center ? ' translate(-50%, -50%)' : '';
    const boundedDistance = Number.isFinite(cameraDistance) && cameraDistance > 0 ? cameraDistance : 1;
    const scale = distanceFactor === undefined
        ? 1
        : Math.min(2.5, Math.max(0.35, distanceFactor / boundedDistance));
    const [zIndexNear, zIndexFar] = zIndexRange ?? [1000, 0];
    const depthRatio = Math.min(1, Math.max(0, (projectedZ + 1) / 2));
    const zIndex = Math.round(zIndexNear + (zIndexFar - zIndexNear) * depthRatio);

    return {
        display: visible ? 'block' : 'none',
        transform: `translate3d(${screenX.toFixed(2)}px, ${screenY.toFixed(2)}px, 0)${anchor} scale(${scale.toFixed(3)})`,
        zIndex: String(zIndex),
    };
};
