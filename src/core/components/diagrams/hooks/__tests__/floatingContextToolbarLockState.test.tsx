// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import { ToolbarColorSwatch } from '../../../shared/FloatingToolbar/ToolbarPrimitives';

describe('flowchart locked color action', () => {
    it('removes the color action from keyboard navigation and mutation', () => {
        const onClick = vi.fn();

        render(
            <ConfigProvider>
                <ToolbarColorSwatch
                    color="#2196f3"
                    label="Color (unlock to use)"
                    onClick={onClick}
                    disabled
                />
            </ConfigProvider>,
        );

        const button = screen.getByRole('button', { name: 'Color (unlock to use)' });
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.getAttribute('tabindex')).toBe('-1');

        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });
});
