// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useKeyboardAccessiblePopover } from '../useKeyboardAccessiblePopover';

const Harness = () => {
    const contentRef = useRef<HTMLDivElement>(null);
    const {
        handleContentKeyDown,
        handleOpenChange,
        handleTriggerKeyDown,
        open,
        triggerRef,
    } = useKeyboardAccessiblePopover({ contentRef });

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-expanded={open}
                onClick={() => handleOpenChange(!open)}
                onKeyDown={handleTriggerKeyDown}
            >
                Canvas settings
            </button>
            {open && (
                <div ref={contentRef} role="dialog" onKeyDown={handleContentKeyDown}>
                    <button type="button">Minimap</button>
                    <button type="button">Grid</button>
                </div>
            )}
            <button type="button" onClick={() => handleOpenChange(false)}>Outside</button>
        </>
    );
};

describe('useKeyboardAccessiblePopover', () => {
    it.each(['Enter', ' ', 'ArrowDown'])('opens with %s and focuses the first control', async key => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Canvas settings' });

        fireEvent.keyDown(trigger, { key });

        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Minimap' })));
    });

    it('closes with Escape and restores focus to the trigger', async () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Canvas settings' });
        fireEvent.keyDown(trigger, { key: 'Enter' });
        const firstControl = await screen.findByRole('button', { name: 'Minimap' });
        await waitFor(() => expect(document.activeElement).toBe(firstControl));

        fireEvent.keyDown(firstControl, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('does not steal focus when an outside control closes the popover', async () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Canvas settings' });
        fireEvent.click(trigger);
        const outside = screen.getByRole('button', { name: 'Outside' });
        outside.focus();

        fireEvent.click(outside);

        await waitFor(() => expect(document.activeElement).toBe(outside));
    });
});
