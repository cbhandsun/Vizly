import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefersReducedMotion } from '../usePrefersReducedMotion';

const Probe = () => <output data-testid="preference">{String(usePrefersReducedMotion())}</output>;
afterEach(() => vi.unstubAllGlobals());

describe('reduced motion subscription', () => {
    it('uses a stable server snapshot without consulting the browser', () => {
        const matchMedia = vi.fn(() => ({ matches: true }));
        vi.stubGlobal('matchMedia', matchMedia);
        expect(renderToString(<Probe />)).toContain('false');
        expect(matchMedia).not.toHaveBeenCalled();
    });
    it.each([false, true])('reads the initial %s preference and removes the modern listener', (initial) => {
        let matches = initial;
        const listeners = new Set<() => void>();
        const media = {
            get matches() { return matches; },
            addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
            removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
        };
        const matchMedia = vi.fn(() => media);
        vi.stubGlobal('matchMedia', matchMedia);
        const view = render(<Probe />);
        expect(screen.getByTestId('preference').textContent).toBe(String(initial));
        expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
        act(() => { matches = !initial; for (const listener of listeners) listener(); });
        expect(screen.getByTestId('preference').textContent).toBe(String(!initial));
        view.unmount();
        expect(listeners.size).toBe(0);
        expect(media.removeEventListener).toHaveBeenCalledOnce();
    });

    it('supports legacy listeners and clears their subscription', () => {
        let matches = true;
        const listeners = new Set<() => void>();
        const media = {
            get matches() { return matches; },
            addListener: (listener: () => void) => listeners.add(listener),
            removeListener: (listener: () => void) => listeners.delete(listener),
        };
        vi.stubGlobal('matchMedia', () => media);
        const view = render(<Probe />);
        expect(screen.getByTestId('preference').textContent).toBe('true');
        act(() => { matches = false; for (const listener of listeners) listener(); });
        expect(screen.getByTestId('preference').textContent).toBe('false');
        view.unmount();
        expect(listeners.size).toBe(0);
    });

    it('uses the normal motion policy when the browser API is unavailable', () => {
        vi.stubGlobal('matchMedia', undefined);
        render(<Probe />);
        expect(screen.getByTestId('preference').textContent).toBe('false');
    });

    it('reads the preference even when subscriptions are unavailable', () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true }));
        const view = render(<Probe />);
        expect(screen.getByTestId('preference').textContent).toBe('true');
        expect(() => view.unmount()).not.toThrow();
    });
});
