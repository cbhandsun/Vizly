// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ColorSwatch } from '../MindMapPropertyPanelControls';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { color?: string }) => options?.color ?? key,
    }),
}));

describe('ColorSwatch', () => {
    it('exposes the selected preset and commits preset, transparent, and custom colors', () => {
        const onChange = vi.fn();
        const { container } = render(
            <ColorSwatch ariaLabel="Text color" onChange={onChange} value="#6366f1" withTransparent />,
        );

        const selectedPreset = container.querySelector<HTMLButtonElement>('button[title="#6366f1"]');
        const redPreset = container.querySelector<HTMLButtonElement>('button[title="#ef4444"]');
        const transparent = container.querySelector<HTMLButtonElement>('button:first-of-type');
        const custom = container.querySelector<HTMLInputElement>('input[type="color"]');

        expect(screen.getByRole('group', { name: 'Text color' }).getAttribute('aria-busy')).toBe('false');
        expect(selectedPreset?.getAttribute('aria-pressed')).toBe('true');
        expect(redPreset).not.toBeNull();
        expect(transparent).not.toBeNull();
        expect(custom).not.toBeNull();

        fireEvent.click(redPreset as HTMLButtonElement);
        fireEvent.click(transparent as HTMLButtonElement);
        fireEvent.change(custom as HTMLInputElement, { target: { value: '#123456' } });

        expect(onChange.mock.calls).toEqual([['#ef4444'], [''], ['#123456']]);
    });

    it('disables every color input and links pending feedback to the group', () => {
        const onChange = vi.fn();
        const { container } = render(
            <ColorSwatch
                ariaLabel="Branch color"
                busy
                describedBy="branch-color-error"
                disabled
                onChange={onChange}
                value=""
                withTransparent
            />,
        );

        const group = screen.getByRole('group', { name: 'Branch color' });
        const buttons = screen.getAllByRole('button');
        const custom = container.querySelector<HTMLInputElement>('input[type="color"]');
        expect(group.getAttribute('aria-busy')).toBe('true');
        expect(group.getAttribute('aria-describedby')).toBe('branch-color-error');
        expect(buttons.every(button => button.hasAttribute('disabled'))).toBe(true);
        expect(custom?.disabled).toBe(true);

        fireEvent.click(buttons[0]);
        expect(onChange).not.toHaveBeenCalled();
    });
});
