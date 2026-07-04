type ContainerSize = {
  width: number;
  height: number;
};

export const hasBaseReactFlowRenderableSize = ({
  containerSize,
  liveRect,
}: {
  containerSize: ContainerSize;
  liveRect?: Pick<DOMRect, 'width' | 'height'> | null;
}): boolean => {
  const liveWidth = liveRect?.width ?? 0;
  const liveHeight = liveRect?.height ?? 0;

  return (containerSize.width > 0 && containerSize.height > 0) || (liveWidth > 0 && liveHeight > 0);
};

export const scheduleBaseReactFlowContainerReadyUpdate = ({
  hasRenderableSize,
  isContainerReady,
  setIsContainerReady,
  setTimeoutImpl = window.setTimeout.bind(window),
}: {
  hasRenderableSize: boolean;
  isContainerReady: boolean;
  setIsContainerReady: (ready: boolean) => void;
  setTimeoutImpl?: (handler: TimerHandler, timeout?: number) => number;
}): number | null => {
  if (hasRenderableSize) {
    if (!isContainerReady) {
      return setTimeoutImpl(() => {
        setIsContainerReady(true);
      }, 0);
    }
    return null;
  }

  if (!isContainerReady) {
    return setTimeoutImpl(() => {
      setIsContainerReady(false);
    }, 0);
  }

  return null;
};
