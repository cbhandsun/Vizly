// @vitest-environment jsdom

import React from 'react';
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
});
