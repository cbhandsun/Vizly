import type { SmartEdgeNode } from './smartEdgeNodeGeometry';

type HandleId = string | null | undefined;

export interface SmartEdgeHandleSelectionInput {
    rawSourceHandleId: HandleId;
    rawTargetHandleId: HandleId;
    manualHandleSides: unknown;
    inferredSubDomainHandles: unknown;
    sourceNode?: SmartEdgeNode;
    targetNode?: SmartEdgeNode;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    incomingToTarget: number;
    outgoingFromSource: number;
}

export interface SmartEdgeHandleSelection {
    sourceHandleId: HandleId;
    targetHandleId: HandleId;
}

const isHorizontalHandle = (handle: string): boolean => (
    handle === 'left'
    || handle === 'right'
    || handle === 'l'
    || handle === 'r'
    || handle.includes('left')
    || handle.includes('right')
);

const finiteNumber = (value: unknown, fallback = 0): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export const resolveSmartEdgeHandleSelection = ({
    rawSourceHandleId,
    rawTargetHandleId,
    manualHandleSides,
    inferredSubDomainHandles,
    sourceNode,
    targetNode,
    sourceX,
    sourceY,
    targetX,
    targetY,
    incomingToTarget,
    outgoingFromSource,
}: SmartEdgeHandleSelectionInput): SmartEdgeHandleSelection => {
    const preserveSelection = (): SmartEdgeHandleSelection => ({
        sourceHandleId: rawSourceHandleId,
        targetHandleId: rawTargetHandleId,
    });
    const manualSides = Array.isArray(manualHandleSides)
        ? manualHandleSides.map((side) => String(side).toLowerCase())
        : [];
    if (!manualSides.includes('source') || !manualSides.includes('target')) {
        return preserveSelection();
    }

    const lowerSource = String(rawSourceHandleId || '').toLowerCase();
    const lowerTarget = String(rawTargetHandleId || '').toLowerCase();
    if (!isHorizontalHandle(lowerSource) || !isHorizontalHandle(lowerTarget)) {
        return preserveSelection();
    }

    const sourceAbsolute = sourceNode?.positionAbsolute ?? {
        x: finiteNumber(sourceX),
        y: finiteNumber(sourceY),
    };
    const targetAbsolute = targetNode?.positionAbsolute ?? {
        x: finiteNumber(targetX),
        y: finiteNumber(targetY),
    };
    const sourceWidth = finiteNumber(sourceNode?.measured?.width ?? sourceNode?.width);
    const sourceHeight = finiteNumber(sourceNode?.measured?.height ?? sourceNode?.height);
    const targetWidth = finiteNumber(targetNode?.measured?.width ?? targetNode?.width);
    const targetHeight = finiteNumber(targetNode?.measured?.height ?? targetNode?.height);
    const dx = (finiteNumber(targetAbsolute.x) + targetWidth / 2)
        - (finiteNumber(sourceAbsolute.x) + sourceWidth / 2);
    const dy = (finiteNumber(targetAbsolute.y) + targetHeight / 2)
        - (finiteNumber(sourceAbsolute.y) + sourceHeight / 2);
    if (Math.abs(dx) < 80 || Math.abs(dy) <= Math.abs(dx) * 1.4) {
        return preserveSelection();
    }

    const sourceParent = sourceNode?.parentId || sourceNode?.parentNode;
    const targetParent = targetNode?.parentId || targetNode?.parentNode;
    const sourceDomain = String(sourceNode?.data?.domain || '').trim();
    const targetDomain = String(targetNode?.data?.domain || '').trim();
    const sourceSubDomain = String(sourceNode?.data?.subDomain || '').trim();
    const targetSubDomain = String(targetNode?.data?.subDomain || '').trim();
    const crossesContainer = Boolean(sourceParent && targetParent && sourceParent !== targetParent)
        || Boolean(
            sourceDomain
            && targetDomain
            && sourceDomain === targetDomain
            && sourceSubDomain
            && targetSubDomain
            && sourceSubDomain !== targetSubDomain
        );
    if (!crossesContainer && Math.abs(dy) <= 480) {
        return preserveSelection();
    }

    const participatesInFan = incomingToTarget > 1 || outgoingFromSource > 1;
    if (inferredSubDomainHandles === true && participatesInFan) {
        return preserveSelection();
    }

    const outerSide = dx >= 0 ? 'right' : 'left';
    return { sourceHandleId: outerSide, targetHandleId: outerSide };
};
