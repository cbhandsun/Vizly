// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEdgeLabelMeasurement } from '../edgeLabelMeasurement';

const Harness = ({ text }: { text: string }) => {
  const { labelRef, labelSize } = useEdgeLabelMeasurement(text, undefined);
  return <><div ref={labelRef}>{text}</div><output>{JSON.stringify(labelSize ?? null)}</output></>;
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('label DOM measurement lifecycle', () => {
  it('retains complete safe text, measures actual wrapping and ignores stale callbacks', () => {
    let width = 220;
    let height = 134;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
    const callbacks: Array<() => void> = [];
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback); }
      observe() {}
      disconnect = disconnect;
    });
    const text = '<img src=x onerror=alert(1)>' + '条件'.repeat(70);
    const view = render(<Harness text={text} />);
    expect(screen.getByText(text).textContent).toBe(text);
    expect(view.container.querySelector('img')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('{"width":221,"height":135}');
    height = 166;
    act(() => callbacks[0]());
    expect(screen.getByRole('status').textContent).toBe('{"width":221,"height":167}');
    width = 60;
    height = 22;
    view.rerender(<Harness text="new" />);
    expect(disconnect).toHaveBeenCalledTimes(1);
    width = 999;
    act(() => callbacks[0]());
    expect(screen.getByRole('status').textContent).toBe('{"width":61,"height":23}');
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
    act(() => callbacks[1]());
  });
  it('leaves hidden or unavailable measurements to the fallback without looping', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Harness text="hidden" />);
    expect(screen.getByRole('status').textContent).toBe('null');
  });
});
