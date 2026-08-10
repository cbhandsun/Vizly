import { focusWorkspaceTarget } from './workspaceMenuInteraction';

type FrameScheduler = (callback: FrameRequestCallback) => number;
type FrameCanceller = (handle: number) => void;

export const scheduleWorkspaceRouteFocus = (
  getTarget: () => HTMLElement | null,
  scheduleFrame: FrameScheduler = window.requestAnimationFrame.bind(window),
  cancelFrame: FrameCanceller = window.cancelAnimationFrame.bind(window),
): (() => void) => {
  const frameHandle = scheduleFrame(() => {
    focusWorkspaceTarget(getTarget());
  });

  return () => cancelFrame(frameHandle);
};
