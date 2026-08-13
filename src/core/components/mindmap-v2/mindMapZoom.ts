export const MIND_MAP_MIN_SCALE = 0.2;
export const MIND_MAP_MAX_SCALE = 3;
export const MIND_MAP_SCALE_STEP = 0.1;

export type MindMapZoomCommand = 'in' | 'out' | 'reset';

interface MindMapZoomTarget {
  scale: (scaleVal: number) => void;
  scaleVal: unknown;
}

const roundScale = (value: number): number => Math.round(value * 10) / 10;

export const normalizeMindMapScale = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(MIND_MAP_MAX_SCALE, Math.max(MIND_MAP_MIN_SCALE, roundScale(value)));
};

export const toMindMapZoomPercent = (value: unknown): number => (
  Math.round(normalizeMindMapScale(value) * 100)
);

export const applyMindMapZoomCommand = (
  mind: MindMapZoomTarget,
  command: MindMapZoomCommand,
): number => {
  const currentScale = normalizeMindMapScale(mind.scaleVal);
  const targetScale = command === 'reset'
    ? 1
    : normalizeMindMapScale(currentScale + (command === 'in' ? MIND_MAP_SCALE_STEP : -MIND_MAP_SCALE_STEP));

  if (targetScale !== currentScale) mind.scale(targetScale);
  return toMindMapZoomPercent(targetScale);
};
