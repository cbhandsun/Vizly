// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MindMapToolbarIconButton from '../MindMapToolbarIconButton';

describe('MindMapToolbarIconButton', () => {
    it('provides a stable name, pressed state, and commercial touch class', () => {
        render(
            <MindMapToolbarIconButton
                icon={<span aria-hidden="true">icon</span>}
                label="焦点模式"
                pressed
            />,
        );

        const button = screen.getByRole('button', { name: '焦点模式' });
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.classList.contains('mind-elixir-toolbar-button')).toBe(true);
    });

    it('keeps the trigger accessible while suppressing its tooltip behind an open menu', async () => {
        render(
            <MindMapToolbarIconButton
                icon={<span aria-hidden="true">icon</span>}
                label="导出思维导图"
                suppressTooltip
            />,
        );

        const button = screen.getByRole('button', { name: '导出思维导图' });
        fireEvent.mouseEnter(button);

        await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
        expect(button.getAttribute('aria-label')).toBe('导出思维导图');
    });
});
