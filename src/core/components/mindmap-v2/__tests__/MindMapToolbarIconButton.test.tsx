// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
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
});
