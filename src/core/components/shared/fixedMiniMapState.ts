export type FixedMiniMapMessage = 'loading' | 'empty' | null;

export const shouldFreezeFixedMiniMapDuringNodeDrag = ({
  wasDragging,
  isDragging,
}: {
  wasDragging: boolean;
  isDragging: boolean;
}): boolean => wasDragging && isDragging;

export const resolveFixedMiniMapMessage = ({
  ready,
  nodeCount,
  hasBounds,
}: {
  ready: boolean;
  nodeCount: number;
  hasBounds: boolean;
}): FixedMiniMapMessage => {
  if (!ready) return 'loading';
  if (nodeCount === 0) return 'empty';
  return hasBounds ? null : 'loading';
};
