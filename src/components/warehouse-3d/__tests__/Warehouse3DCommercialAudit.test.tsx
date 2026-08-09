// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({ Html: ({ children }: { children: ReactNode }) => children }));
vi.mock('../Scene', () => ({
    default: ({
        onModelReady,
    }: {
        onModelReady?: () => void;
    }) => (
        <>
            <button type="button" onClick={onModelReady}>model ready</button>
        </>
    ),
}));
vi.mock('../Floor', () => ({ default: () => null }));
vi.mock('../Racks', () => ({ default: () => <div data-testid="warehouse-stage-one" /> }));
vi.mock('../Conveyors', () => ({ default: () => null }));
vi.mock('../AsrsSystem', () => ({ default: () => null }));
vi.mock('../SupportAreas', () => ({ default: () => null }));
vi.mock('../Docks', () => ({ default: () => null }));
vi.mock('../LogisticsFlow', () => ({ default: () => null }));
vi.mock('../Vehicles', () => ({ default: () => null }));
vi.mock('../Trucks', () => ({ default: () => null }));
vi.mock('../Workers', () => ({ default: () => <div data-testid="warehouse-stage-two" /> }));
vi.mock('../DigitalTwinUI', () => ({ default: () => null }));
vi.mock('../StructuralElements', () => ({ default: () => null }));

import ControlsOverlay from '../ControlsOverlay';
import { Warehouse3DErrorBoundary } from '../Warehouse3DErrorBoundary';
import { Warehouse3DProvider } from '../WarehouseContext';
import WarehouseModel from '../WarehouseModel';
import Warehouse3DShell from '../Warehouse3DShell';
import Zones from '../Zones';
import Warehouse3DPage from '../../../pages/Warehouse3DPage';
import i18n from '../../../i18n';

describe('Warehouse 3D commercial safeguards', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        await i18n.changeLanguage('zh');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders warehouse labels through DOM-backed overlays', () => {
        render(
            <Warehouse3DProvider>
                <Zones />
            </Warehouse3DProvider>,
        );

        expect(screen.getByText('入库接收月台')).toBeTruthy();
        expect(screen.getByText('自动化立体仓库 (AS/RS)')).toBeTruthy();
    });

    it('makes the route shell measurable while the heavy scene loads progressively', async () => {
        const { container } = render(<Warehouse3DPage />);
        const page = container.firstElementChild;

        expect(page?.getAttribute('data-smoke-ready')).toBe('warehouse-3d');
        expect(screen.getByRole('status').textContent).toContain('正在加载 3D 场景');

        fireEvent.click(await screen.findByRole('button', { name: 'model ready' }));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('provides a branded route fallback before the page module is available', () => {
        const { container } = render(<Warehouse3DShell loading />);

        expect(container.firstElementChild?.getAttribute('data-smoke-ready')).toBe('warehouse-3d');
        expect(screen.getByText('大型零售物流中心')).toBeTruthy();
        expect(screen.getByText('交互式 3D 仿真视图')).toBeTruthy();
        const returnLink = screen.getByRole('link', { name: '返回工作台' });
        expect(returnLink.getAttribute('href')).toBe('#/manage');
        expect(returnLink.style.minHeight).toBe('44px');
        expect(screen.getByRole('status').textContent).toContain('正在加载 3D 场景');
    });

    it('anchors the controls to the viewport shell instead of a zero-height wrapper', () => {
        const { container } = render(
            <Warehouse3DProvider>
                <Warehouse3DShell loading={false} controls={<ControlsOverlay />} />
            </Warehouse3DProvider>,
        );
        const shell = container.firstElementChild;
        const toolbar = screen.getByRole('toolbar', { name: '3D 智能仓库场景控制' });

        expect(toolbar.parentElement).toBe(shell);
        expect(toolbar.className).toContain('bottom-6');
        expect(toolbar.className).toContain('z-20');
    });

    it('starts with labels hidden on narrow viewports', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 522 });

        render(
            <Warehouse3DProvider>
                <ControlsOverlay />
            </Warehouse3DProvider>,
        );

        expect(screen.getByRole('button', { name: '显示标签' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('marks the core scene ready before progressively mounting heavy details', () => {
        vi.useFakeTimers();
        const onReady = vi.fn();

        render(
            <Warehouse3DProvider>
                <WarehouseModel onReady={onReady} />
            </Warehouse3DProvider>,
        );

        expect(onReady).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('warehouse-stage-one')).toBeNull();
        expect(screen.queryByTestId('warehouse-stage-two')).toBeNull();

        act(() => vi.advanceTimersByTime(2500));
        expect(screen.getByTestId('warehouse-stage-one')).toBeTruthy();
        expect(screen.queryByTestId('warehouse-stage-two')).toBeNull();

        act(() => vi.advanceTimersByTime(2500));
        expect(screen.getByTestId('warehouse-stage-two')).toBeTruthy();
    });

    it('exposes toggle states and 44px control targets', () => {
        render(
            <Warehouse3DProvider>
                <ControlsOverlay />
            </Warehouse3DProvider>,
        );

        const autoRotate = screen.getByRole('button', { name: /自动旋转/ });
        const labels = screen.getByRole('button', { name: /显示标签/ });
        const flow = screen.getByRole('button', { name: /物流动态/ });
        const reset = screen.getByRole('button', { name: /重置视角/ });

        expect(autoRotate.getAttribute('aria-pressed')).toBe('false');
        expect(labels.getAttribute('aria-pressed')).toBe('true');
        expect(flow.getAttribute('aria-pressed')).toBe('true');
        expect(reset.hasAttribute('aria-pressed')).toBe(false);
        for (const button of [autoRotate, labels, flow, reset]) {
            expect(button.style.minHeight).toBe('44px');
            expect(button.style.minWidth).toBe('44px');
        }

        fireEvent.click(autoRotate);
        fireEvent.click(labels);
        fireEvent.click(flow);
        expect(autoRotate.getAttribute('aria-pressed')).toBe('true');
        expect(labels.getAttribute('aria-pressed')).toBe('false');
        expect(flow.getAttribute('aria-pressed')).toBe('false');
    });

    it('makes reset completion visible and restores the stable action label', () => {
        vi.useFakeTimers();
        render(
            <Warehouse3DProvider>
                <ControlsOverlay />
            </Warehouse3DProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: '重置视角' }));
        expect(screen.getByRole('button', { name: '视角已重置' })).toBeTruthy();

        act(() => vi.advanceTimersByTime(1600));
        expect(screen.getByRole('button', { name: '重置视角' })).toBeTruthy();
    });

    it('offers retry and management recovery when scene rendering throws', () => {
        const onRetry = vi.fn();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const BrokenScene = () => {
            throw new Error('scene failure');
        };

        render(
            <Warehouse3DErrorBoundary onRetry={onRetry}>
                <BrokenScene />
            </Warehouse3DErrorBoundary>,
        );

        expect(screen.getByRole('alert').textContent).toContain('3D 场景加载失败');
        expect(screen.getByRole('link', { name: '返回管理页' }).getAttribute('href')).toBe('#/manage');
        fireEvent.click(screen.getByRole('button', { name: '重试加载' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        consoleError.mockRestore();
    });
});
