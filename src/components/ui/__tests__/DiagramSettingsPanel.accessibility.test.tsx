// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

vi.mock('@/components/shared/EnhancedStyleSwitcher', () => ({
    default: ({ ariaLabel }: { ariaLabel?: string }) => <button aria-label={ariaLabel}>style</button>,
}));

vi.mock('../EnhancedThemeSelector', () => ({
    EnhancedThemeSelector: ({ ariaLabel }: { ariaLabel?: string }) => <button aria-label={ariaLabel}>theme</button>,
}));

vi.mock('../ConfigurationPanel', () => ({
    ConfigurationPanel: () => null,
}));

const strategy = {
    getName: () => 'Vertical',
    getDescription: () => 'Vertical layout',
};

vi.mock('@/core/strategies/LayoutStrategyManager', () => ({
    LayoutStrategyManager: {
        getShared: () => ({
            getAvailableHierarchyStrategies: () => [{ type: 'DomainVerticalLayout', strategy }],
            getAvailableNodeStrategies: () => [{ type: 'VerticalLayout', strategy }],
            isNodeLayoutExternallySelectable: () => true,
            getPreferredNodeStrategyForHierarchy: () => 'VerticalLayout',
        }),
    },
}));

import { DiagramSettingsPanel } from '../DiagramSettingsPanel';

describe('DiagramSettingsPanel accessibility', () => {
    it('keeps narrow-screen controls full-width with commercial touch heights', () => {
        const css = readFileSync('src/components/ui/DiagramSettingsPanel.css', 'utf8');

        expect(css).toContain('@media (max-width: 360px)');
        expect(css).toContain('width: calc(100% - 48px)');
        expect(css).toContain('min-height: var(--commercial-touch-target, 44px)');
        expect(css).toContain('.diagram-settings-row__control .ant-select-selector');
        expect(css).toContain('.diagram-settings-row__control button:not(.ant-switch)');
    });

    it('gives each visible setting control a contextual accessible name', () => {
        render(
            <DiagramSettingsPanel
                selectedDiagramId="diagram-1"
                edgeMode="advanced-smart"
                onEdgeModeChange={vi.fn()}
                layoutStrategy="DomainVerticalLayout"
                onLayoutStrategyChange={vi.fn()}
                nodeLayoutStrategy="VerticalLayout"
                onNodeLayoutStrategyChange={vi.fn()}
                elkAlgorithm="layered"
                onElkAlgorithmChange={vi.fn()}
                linkOrientationEnabled={false}
                showOnlyMainFlow={false}
                onShowOnlyMainFlowChange={vi.fn()}
                onRefreshRequest={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: '颜色主题' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '线条风格' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'designer.settings.edgeMode' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'designer.settings.layoutStrategy' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'designer.settings.nodeLayout' })).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'designer.settings.showMainFlow' })).toBeTruthy();
    });

    it('exposes the narrow-screen reflow hooks for setting summaries and controls', () => {
        const { container } = render(
            <DiagramSettingsPanel
                selectedDiagramId="diagram-1"
                edgeMode="advanced-smart"
                onEdgeModeChange={vi.fn()}
                layoutStrategy="DomainVerticalLayout"
                onLayoutStrategyChange={vi.fn()}
                nodeLayoutStrategy="VerticalLayout"
                onNodeLayoutStrategyChange={vi.fn()}
                elkAlgorithm="layered"
                onElkAlgorithmChange={vi.fn()}
                linkOrientationEnabled={false}
                showOnlyMainFlow={false}
                onShowOnlyMainFlowChange={vi.fn()}
                onRefreshRequest={vi.fn()}
            />,
        );

        expect(container.querySelectorAll('.diagram-settings-row')).toHaveLength(6);
        expect(container.querySelectorAll('.diagram-settings-row__summary')).toHaveLength(6);
        expect(container.querySelectorAll('.diagram-settings-row__control')).toHaveLength(6);
        expect(container.querySelector('.diagram-settings-scroll')).toBeTruthy();
    });

    it('keeps view preferences available while disabling document mutations on a locked canvas', () => {
        const onNodeLayoutStrategyChange = vi.fn();

        render(
            <DiagramSettingsPanel
                selectedDiagramId="diagram-1"
                edgeMode="advanced-smart"
                onEdgeModeChange={vi.fn()}
                layoutStrategy="DomainVerticalLayout"
                onLayoutStrategyChange={vi.fn()}
                nodeLayoutStrategy="UnsupportedLayout"
                onNodeLayoutStrategyChange={onNodeLayoutStrategyChange}
                elkAlgorithm="layered"
                onElkAlgorithmChange={vi.fn()}
                linkOrientationEnabled={false}
                showOnlyMainFlow={false}
                onShowOnlyMainFlowChange={vi.fn()}
                onRefreshRequest={vi.fn()}
                editingEnabled={false}
            />,
        );

        expect(screen.getByRole('status')).toHaveTextContent('画布已锁定');
        expect(screen.getByRole('button', { name: '颜色主题' })).toBeEnabled();
        expect(screen.getByRole('button', { name: '线条风格' })).toBeEnabled();
        expect(screen.getByRole('switch', { name: 'designer.settings.showMainFlow' })).toBeEnabled();
        expect(screen.getAllByRole('combobox')).toHaveLength(3);
        for (const control of screen.getAllByRole('combobox')) {
            expect(control).toBeDisabled();
        }
        expect(screen.getByRole('button', { name: /designer.settings.advancedConfig/ })).toBeDisabled();
        expect(onNodeLayoutStrategyChange).not.toHaveBeenCalled();
    });
});
