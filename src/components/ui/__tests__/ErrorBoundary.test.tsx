// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

vi.mock('@vizly/core/logging', () => ({ logUiBoundaryError: vi.fn() }));
vi.mock('antd', () => ({
    Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
    Result: ({ title, subTitle, extra }: { title: string; subTitle: string; extra: React.ReactNode }) => <div>{title}{subTitle}{extra}</div>,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('diagram render recovery', () => {
    it('supports deliberate retry and resets when switching documents', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let failing = true;
        const Canvas = () => { if (failing) throw new Error('private user content'); return <div>Canvas ready</div>; };
        const view = (resetKey: string) => <ErrorBoundary title="Render failed" subTitle="Retry" retryLabel="Reload canvas" resetKey={resetKey}><Canvas /></ErrorBoundary>;
        const result = render(view('a'));
        expect(screen.queryByText('private user content')).toBeNull();
        failing = false;
        fireEvent.click(screen.getByRole('button', { name: 'Reload canvas' }));
        expect(screen.getByText('Canvas ready')).toBeTruthy();
        failing = true; result.rerender(view('a'));
        failing = false; result.rerender(view('b'));
        expect(screen.getByText('Canvas ready')).toBeTruthy();
    });
    it('keeps a persistent failure contained after retry', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const Canvas = () => { throw new Error('failed'); };
        render(<ErrorBoundary title="Unavailable" subTitle="Retry" retryLabel="Reload"><Canvas /></ErrorBoundary>);
        fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
        expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    });
});
