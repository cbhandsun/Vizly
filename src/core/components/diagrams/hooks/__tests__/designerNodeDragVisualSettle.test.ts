// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelDesignerNodeDragVisualSettle,
  markDesignerNodeDragRoutingFinalApplied,
  scheduleDesignerNodeDragVisualSettle,
  type DesignerNodeDragVisualSettleRef,
} from '../designerNodeDragVisualSettle';

const createTimerRef = (): DesignerNodeDragVisualSettleRef => ({ current: null });

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('designerNodeDragVisualSettle', () => {
  it('keeps the drop state frozen for the bounded routing commit window', () => {
    vi.useFakeTimers();
    const element = document.createElement('div');
    element.setAttribute('data-id', 'node-with-"quotes"');
    document.body.append(element);
    const timerRef = createTimerRef();
    const onSettled = vi.fn();

    scheduleDesignerNodeDragVisualSettle({
      nodeId: 'node-with-"quotes"',
      timerRef,
      onSettled,
    });
    markDesignerNodeDragRoutingFinalApplied(timerRef);
    expect(element.classList.contains('just-dropped')).toBe(true);
    vi.advanceTimersByTime(299);
    expect(onSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(element.classList.contains('just-dropped')).toBe(false);
    expect(onSettled).toHaveBeenCalledOnce();
    expect(timerRef.current).toBeNull();
  });

  it('waits for the final routing commit after the minimum visual window', () => {
    vi.useFakeTimers();
    const timerRef = createTimerRef();
    const onSettled = vi.fn();

    scheduleDesignerNodeDragVisualSettle({ nodeId: 'node-a', timerRef, onSettled });
    vi.advanceTimersByTime(300);
    expect(onSettled).not.toHaveBeenCalled();

    markDesignerNodeDragRoutingFinalApplied(timerRef);
    expect(onSettled).toHaveBeenCalledOnce();
    expect(timerRef.current).toBeNull();
  });

  it('fails open after the bounded watchdog when routing never commits', () => {
    vi.useFakeTimers();
    const timerRef = createTimerRef();
    const onSettled = vi.fn();

    scheduleDesignerNodeDragVisualSettle({ nodeId: 'node-a', timerRef, onSettled });
    vi.advanceTimersByTime(499);
    expect(onSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onSettled).toHaveBeenCalledOnce();
    expect(timerRef.current).toBeNull();
  });

  it('cancels a stale settle before a new drag or unmount', () => {
    vi.useFakeTimers();
    const element = document.createElement('div');
    element.setAttribute('data-id', 'node-a');
    document.body.append(element);
    const timerRef = createTimerRef();
    const onSettled = vi.fn();

    scheduleDesignerNodeDragVisualSettle({ nodeId: 'node-a', timerRef, onSettled });
    cancelDesignerNodeDragVisualSettle(timerRef);
    vi.runAllTimers();

    expect(element.classList.contains('just-dropped')).toBe(false);
    expect(onSettled).not.toHaveBeenCalled();
    expect(timerRef.current).toBeNull();
  });

  it('settles bounded invalid identifiers without querying an unsafe selector', () => {
    vi.useFakeTimers();
    const timerRef = createTimerRef();
    const onSettled = vi.fn();

    scheduleDesignerNodeDragVisualSettle({ nodeId: '', timerRef, onSettled });
    vi.runAllTimers();

    expect(onSettled).toHaveBeenCalledOnce();
    expect(timerRef.current).toBeNull();
  });
});
