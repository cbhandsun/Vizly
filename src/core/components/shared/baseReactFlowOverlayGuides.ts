import { getQueryParamFromSearch } from '../../utils/inputBoundary';

type GuideNode = {
  id?: string;
  type?: string;
  position?: { x?: unknown; y?: unknown };
  measured?: { width?: unknown; height?: unknown };
  style?: { width?: unknown; height?: unknown };
  data?: Record<string, unknown>;
};

type GuideEnv = {
  getSearch: () => string;
  getStorageItem: (key: string) => string | null;
  onReadFailure?: (scope: string, error: unknown) => void;
};

export type BaseReactFlowRightEdgeGuideFlags = {
  rightLine: boolean;
  contentLine: boolean;
};

export type BaseReactFlowGuideLine = {
  x: number;
  y: number;
  height: number;
};

export type BaseReactFlowRightEdgeGuideLine = BaseReactFlowGuideLine & {
  key: string;
  kind: 'right' | 'content';
};

const getFiniteNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const getNodeWidth = (node: GuideNode): number => getFiniteNumber(
  node.measured?.width ?? node.style?.width,
  0,
);

const getNodeHeight = (node: GuideNode, fallback = 120): number => getFiniteNumber(
  node.measured?.height ?? node.style?.height,
  fallback,
);

const readGuideFlag = ({
  env,
  queryKey,
  storageKey,
}: {
  env: GuideEnv;
  queryKey: string;
  storageKey: string;
}): boolean => {
  return getQueryParamFromSearch(env.getSearch(), queryKey) === '1'
    || env.getStorageItem(storageKey) === 'true';
};

export const readBaseReactFlowAlignGuideEnabled = (env: GuideEnv): boolean => {
  try {
    return readGuideFlag({
      env,
      queryKey: 'alignGuide',
      storageKey: 'diagram-align-guide',
    });
  } catch (error) {
    env.onReadFailure?.('alignGuide', error);
    return false;
  }
};

export const readBaseReactFlowRightEdgeGuideFlags = (
  env: GuideEnv,
): BaseReactFlowRightEdgeGuideFlags => {
  try {
    return {
      rightLine: readGuideFlag({
        env,
        queryKey: 'alignGuideRight',
        storageKey: 'diagram-align-guide-right',
      }),
      contentLine: readGuideFlag({
        env,
        queryKey: 'alignContentMax',
        storageKey: 'diagram-align-content-max',
      }),
    };
  } catch (error) {
    env.onReadFailure?.('alignGuideRight/alignContentMax', error);
    return { rightLine: false, contentLine: false };
  }
};

export const computeBaseReactFlowAlignGuideLine = (
  nodes: GuideNode[],
): BaseReactFlowGuideLine | null => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const nodeType = String(node.type || '');
    const x = getFiniteNumber(node.position?.x, 0);
    const y = getFiniteNumber(node.position?.y, 0);
    const height = getNodeHeight(node);

    if (nodeType === 'titleGroup') {
      minX = Math.min(minX, x);
    }
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    height: Math.max(20, Math.round(maxY - minY)),
  };
};

export const computeBaseReactFlowRightEdgeGuideLines = ({
  nodes,
  flags,
}: {
  nodes: GuideNode[];
  flags: BaseReactFlowRightEdgeGuideFlags;
}): BaseReactFlowRightEdgeGuideLine[] => {
  if ((!flags.rightLine && !flags.contentLine) || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const titleGroups = nodes.filter((node) => String(node.type || '') === 'titleGroup');
  const overlays: BaseReactFlowRightEdgeGuideLine[] = [];

  for (const titleGroup of titleGroups) {
    const x = getFiniteNumber(titleGroup.position?.x, 0);
    const y = getFiniteNumber(titleGroup.position?.y, 0);
    const width = getNodeWidth(titleGroup);
    const height = getNodeHeight(titleGroup, 0);
    const rightX = Math.round(x + Math.max(0, width));
    const domainId = String((titleGroup.data || {}).domain || '');

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let contentMaxX = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
      const nodeType = String(node.type || '');
      const belongs = String((node.data || {}).domain || '') === domainId;
      if (!belongs || nodeType === 'titleGroup') {
        continue;
      }

      const nodeX = getFiniteNumber(node.position?.x, 0);
      const nodeY = getFiniteNumber(node.position?.y, 0);
      const nodeWidth = getNodeWidth(node);
      const nodeHeight = getNodeHeight(node, 0);

      minY = Math.min(minY, nodeY);
      maxY = Math.max(maxY, nodeY + nodeHeight);
      contentMaxX = Math.max(contentMaxX, nodeX + nodeWidth);
    }

    const guideY = Math.round(Number.isFinite(minY) ? minY : y);
    const guideHeight = Number.isFinite(minY) && Number.isFinite(maxY)
      ? Math.max(20, Math.round(maxY - minY))
      : Math.max(20, Math.round(height));

    if (flags.rightLine) {
      overlays.push({
        key: `edge-right-${String(titleGroup.id || '')}`,
        kind: 'right',
        x: rightX,
        y: guideY,
        height: guideHeight,
      });
    }

    if (flags.contentLine && Number.isFinite(contentMaxX) && contentMaxX > 0) {
      overlays.push({
        key: `edge-content-${String(titleGroup.id || '')}`,
        kind: 'content',
        x: Math.round(contentMaxX),
        y: guideY,
        height: guideHeight,
      });
    }
  }

  return overlays;
};
