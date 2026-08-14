// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => ({
            'common.off': 'Off',
            'common.on': 'On',
        }[key] ?? (typeof fallback === 'string' ? fallback : key)),
    }),
}));

import { FlowchartCanvasSettingsContent } from '../FlowchartCanvasSettingsContent';

describe('FlowchartCanvasSettingsContent', () => {
    it('exposes helper states, commercial row heights, and actions', () => {
        const toggleMinimap = vi.fn();
        const toggleRuler = vi.fn();
        const toggleGrid = vi.fn();
        const onShowShortcuts = vi.fn();

        render(
            <FlowchartCanvasSettingsContent
                gridInfo={{ title: 'Grid: Lines', icon: <span data-testid="grid-lines-icon">grid icon</span>, stateLabel: 'Lines' }}
                onShowShortcuts={onShowShortcuts}
                showGrid
                showMinimap
                showRuler={false}
                toggleGrid={toggleGrid}
                toggleMinimap={toggleMinimap}
                toggleRuler={toggleRuler}
            />,
        );

        const minimap = screen.getByRole('button', { name: '隐藏小地图' });
        const ruler = screen.getByRole('button', { name: 'designer.toolbar.showRuler' });
        const grid = screen.getByRole('button', { name: 'Grid: Lines' });
        const shortcuts = screen.getByRole('button', { name: /快捷键/ });

        expect(minimap.getAttribute('aria-pressed')).toBe('true');
        expect(ruler.getAttribute('aria-pressed')).toBe('false');
        expect(grid.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('grid-lines-icon')).toBeTruthy();
        expect(screen.getByText('Lines')).toBeTruthy();
        expect(screen.getByText('Off')).toBeTruthy();
        expect(screen.getAllByText('On')).toHaveLength(1);
        for (const button of [minimap, ruler, grid, shortcuts]) {
            expect(button.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
        }

        fireEvent.click(minimap);
        fireEvent.click(ruler);
        fireEvent.click(grid);
        fireEvent.click(shortcuts);
        expect(toggleMinimap).toHaveBeenCalledTimes(1);
        expect(toggleRuler).toHaveBeenCalledTimes(1);
        expect(toggleGrid).toHaveBeenCalledTimes(1);
        expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    });

    it('shows the explicit off state and matching icon for a disabled grid', () => {
        render(
            <FlowchartCanvasSettingsContent
                gridInfo={{ title: 'Grid: Off', icon: <span data-testid="grid-off-icon">off icon</span>, stateLabel: 'Off' }}
                onShowShortcuts={vi.fn()}
                showGrid={false}
                showRuler={false}
                toggleGrid={vi.fn()}
                toggleRuler={vi.fn()}
            />,
        );

        const grid = screen.getByRole('button', { name: 'Grid: Off' });
        expect(grid.getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByTestId('grid-off-icon')).toBeTruthy();
        expect(screen.getAllByText('Off').length).toBeGreaterThanOrEqual(2);
    });

    it('omits the minimap setting when the active canvas cannot support it', () => {
        render(
            <FlowchartCanvasSettingsContent
                gridInfo={{ title: 'Grid: Lines', icon: <span>grid icon</span>, stateLabel: 'Lines' }}
                onShowShortcuts={vi.fn()}
                showGrid
                showMinimap
                showRuler={false}
                toggleGrid={vi.fn()}
                toggleRuler={vi.fn()}
            />,
        );

        expect(screen.queryByRole('button', { name: '隐藏小地图' })).toBeNull();
        expect(screen.queryByText('小地图')).toBeNull();
    });
});
