export type BaseReactFlowFitMode = 'fitWidthTop' | 'fitAll' | 'none';

type Size = {
  width: number;
  height: number;
};

type BaseReactFlowFitScheduleInput = {
  fitMode: BaseReactFlowFitMode;
  hasInstance: boolean;
  nodeCount: number;
  fitTriggerKey: string | number | undefined;
  lastFitTriggerKey: string | number | undefined;
  pinFit: boolean;
  hasInitialized: boolean;
  containerSize: Size;
  previousContainer: Size | null;
  defaultDebounceMs: number;
};

type BaseReactFlowFitSchedulePlan =
  | {
    shouldSchedule: false;
    isTriggerKeyChanged: boolean;
  }
  | {
    shouldSchedule: true;
    isTriggerKeyChanged: boolean;
    debounceTime: number;
  };

export const hasBaseReactFlowSignificantContainerDelta = ({
  containerSize,
  previousContainer,
  threshold = 6,
}: {
  containerSize: Size;
  previousContainer: Size | null;
  threshold?: number;
}): boolean => {
  if (!previousContainer) {
    return true;
  }

  const dw = Math.abs(containerSize.width - previousContainer.width);
  const dh = Math.abs(containerSize.height - previousContainer.height);
  return dw > threshold || dh > threshold;
};

export const resolveBaseReactFlowFitDebounceTime = ({
  defaultDebounceMs,
  hasInitialized,
  isTriggerKeyChanged,
}: {
  defaultDebounceMs: number;
  hasInitialized: boolean;
  isTriggerKeyChanged: boolean;
}): number => {
  if (!hasInitialized) {
    return 200;
  }

  if (isTriggerKeyChanged) {
    return Math.min(defaultDebounceMs, 100);
  }

  return defaultDebounceMs;
};

export const resolveBaseReactFlowFitSchedule = ({
  fitMode,
  hasInstance,
  nodeCount,
  fitTriggerKey,
  lastFitTriggerKey,
  pinFit,
  hasInitialized,
  containerSize,
  previousContainer,
  defaultDebounceMs,
}: BaseReactFlowFitScheduleInput): BaseReactFlowFitSchedulePlan => {
  if (!hasInstance || nodeCount === 0 || fitMode === 'none') {
    return {
      shouldSchedule: false,
      isTriggerKeyChanged: fitTriggerKey !== lastFitTriggerKey,
    };
  }

  const isTriggerKeyChanged = fitTriggerKey !== lastFitTriggerKey;

  if (
    !isTriggerKeyChanged
    && !pinFit
    && hasInitialized
    && !hasBaseReactFlowSignificantContainerDelta({
      containerSize,
      previousContainer,
    })
  ) {
    return {
      shouldSchedule: false,
      isTriggerKeyChanged,
    };
  }

  return {
    shouldSchedule: true,
    isTriggerKeyChanged,
    debounceTime: resolveBaseReactFlowFitDebounceTime({
      defaultDebounceMs,
      hasInitialized,
      isTriggerKeyChanged,
    }),
  };
};
