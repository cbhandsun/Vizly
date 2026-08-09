// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/auth/AuthModal', () => ({
    AuthModal: ({
        open,
        onAfterClose,
    }: {
        open: boolean;
        onAfterClose?: () => void;
    }) => {
        useEffect(() => {
            if (!open) onAfterClose?.();
        }, [onAfterClose, open]);
        return <div data-testid="auth-modal-mounted" data-open={String(open)} />;
    },
}));

import { CloudSaveAuthRecovery } from '../CloudSaveAuthRecovery';

describe('CloudSaveAuthRecovery', () => {
    it('keeps the modal mounted after closing so afterClose can restore focus', async () => {
        const onAfterClose = vi.fn();
        const props = {
            onCancel: vi.fn(),
            onAuthenticated: vi.fn(),
            onAfterClose,
        };
        const { rerender } = render(<CloudSaveAuthRecovery {...props} enabled open />);

        expect((await screen.findByTestId('auth-modal-mounted')).getAttribute('data-open')).toBe('true');
        rerender(<CloudSaveAuthRecovery {...props} enabled open={false} />);

        await waitFor(() => expect(onAfterClose).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId('auth-modal-mounted').getAttribute('data-open')).toBe('false');
    });

    it('does not load the authentication surface before cloud save requests it', () => {
        render(
            <CloudSaveAuthRecovery
                enabled={false}
                open={false}
                onCancel={vi.fn()}
                onAuthenticated={vi.fn()}
                onAfterClose={vi.fn()}
            />,
        );

        expect(screen.queryByTestId('auth-modal-mounted')).toBeNull();
    });
});
