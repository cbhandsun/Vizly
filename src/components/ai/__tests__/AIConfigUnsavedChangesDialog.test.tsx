import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ant-design/icons', () => ({
    ExclamationCircleFilled: () => <span aria-hidden="true" />,
}));

import { AIConfigUnsavedChangesDialog } from '../AIConfigUnsavedChangesDialog';

const t = ((key: string) => key) as TFunction;

afterEach(cleanup);

describe('AIConfigUnsavedChangesDialog', () => {
    it('explains the impact, focuses the safe action, and keeps editing on Escape', async () => {
        const discard = vi.fn();
        const Harness = () => {
            const [open, setOpen] = React.useState(false);
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>Close configuration</button>
                    <AIConfigUnsavedChangesDialog
                        open={open}
                        t={t}
                        onKeepEditing={() => setOpen(false)}
                        onDiscard={discard}
                    />
                </>
            );
        };

        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Close configuration' });
        trigger.focus();
        fireEvent.click(trigger);

        const dialog = screen.getByRole('alertdialog', { name: 'aiConfig.unsavedChangesTitle' });
        expect(screen.getByText('aiConfig.unsavedChangesDescription')).not.toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'aiConfig.keepEditing' }),
        ));

        fireEvent.keyDown(dialog, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(discard).not.toHaveBeenCalled();
    });

    it('discards only through the explicit destructive action', () => {
        const discard = vi.fn();
        render(
            <AIConfigUnsavedChangesDialog
                open
                t={t}
                onKeepEditing={vi.fn()}
                onDiscard={discard}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'aiConfig.discardChanges' }));
        expect(discard).toHaveBeenCalledTimes(1);
    });
});
