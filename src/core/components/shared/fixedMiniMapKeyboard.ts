export type FixedMiniMapKeyboardCommand =
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'reset-zoom';

export const parseFixedMiniMapKeyboardCommand = (key: unknown): FixedMiniMapKeyboardCommand | null => {
  if (typeof key !== 'string') return null;

  switch (key) {
    case 'ArrowLeft': return 'pan-left';
    case 'ArrowRight': return 'pan-right';
    case 'ArrowUp': return 'pan-up';
    case 'ArrowDown': return 'pan-down';
    case '+':
    case '=': return 'zoom-in';
    case '-':
    case '_': return 'zoom-out';
    case '0': return 'reset-zoom';
    default: return null;
  }
};

interface FixedMiniMapPanDeltaInput {
  command: FixedMiniMapKeyboardCommand;
  canvasHeight: unknown;
  canvasWidth: unknown;
  largeStep?: boolean;
}

export const getFixedMiniMapPanDelta = ({
  command,
  canvasHeight,
  canvasWidth,
  largeStep = false,
}: FixedMiniMapPanDeltaInput): { x: number; y: number } | null => {
  if (!['pan-left', 'pan-right', 'pan-up', 'pan-down'].includes(command)) return null;

  const width = typeof canvasWidth === 'number' && Number.isFinite(canvasWidth) && canvasWidth > 0
    ? canvasWidth
    : 1;
  const height = typeof canvasHeight === 'number' && Number.isFinite(canvasHeight) && canvasHeight > 0
    ? canvasHeight
    : 1;
  const ratio = largeStep ? 0.5 : 0.1;

  switch (command) {
    case 'pan-left': return { x: width * ratio, y: 0 };
    case 'pan-right': return { x: -width * ratio, y: 0 };
    case 'pan-up': return { x: 0, y: height * ratio };
    case 'pan-down': return { x: 0, y: -height * ratio };
    default: return null;
  }
};
