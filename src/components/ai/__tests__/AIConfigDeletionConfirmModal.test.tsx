import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ant-design/icons', () => ({
    ExclamationCircleFilled: () => <span aria-hidden="true" />,
}));

import { AIConfigDeletionConfirmModal } from '../AIConfigDeletionConfirmModal';
import type { PendingAIConfigDeletion } from '../useAIConfigDeletion';

const t = ((key: string, options?: Record<string, unknown>) => {
    const details = options
        ? Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(',')
        : '';
    return details ? `${key}:${details}` : key;
}) as TFunction;

const providerDeletion: PendingAIConfigDeletion = {
    kind: 'provider',
    providerId: 'custom-one',
    providerName: 'Custom One',
    modelCount: 2,
};

afterEach(cleanup);

describe('AIConfigDeletionConfirmModal', () => {
    it('stacks the destructive confirmation above the viewport-level config modal', () => {
        const styles = readFileSync(resolve('src/components/ai/AIConfigModal.css'), 'utf8');
        const maskRule = styles.match(/\.ai-config-delete-dialog-mask\s*\{([^}]*)\}/)?.[1] ?? '';

        expect(maskRule).toContain('z-index: 2300');
    });

    it('describes provider impact, focuses cancel first, and restores trigger focus on cancel', async () => {
        const confirm = vi.fn();
        const Harness = () => {
            const [pending, setPending] = React.useState<PendingAIConfigDeletion | null>(null);
            return (
                <>
                    <button type="button" onClick={() => setPending(providerDeletion)}>Delete provider</button>
                    <AIConfigDeletionConfirmModal
                        pendingDeletion={pending}
                        t={t}
                        onCancel={() => setPending(null)}
                        onConfirm={confirm}
                    />
                </>
            );
        };

        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Delete provider' });
        trigger.focus();
        fireEvent.click(trigger);

        expect(screen.getByRole('alertdialog', { name: 'aiConfig.deleteProviderTitle' })).not.toBeNull();
        expect(screen.getByText('aiConfig.deleteProviderDescription:name=Custom One,count=2')).not.toBeNull();
        const cancel = screen.getByRole('button', { name: 'common.cancel' });
        await waitFor(() => expect(document.activeElement).toBe(cancel));

        fireEvent.click(cancel);
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(confirm).not.toHaveBeenCalled();
    });

    it('warns when deleting the active model and confirms only through the destructive action', () => {
        const confirm = vi.fn();
        render(
            <AIConfigDeletionConfirmModal
                pendingDeletion={{
                    kind: 'model',
                    providerId: 'custom-one',
                    modelId: 'active-model',
                    modelName: 'Active Model',
                    isActive: true,
                }}
                t={t}
                onCancel={vi.fn()}
                onConfirm={confirm}
            />,
        );

        expect(screen.getByText('aiConfig.deleteActiveModelDescription:name=Active Model')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
        expect(confirm).toHaveBeenCalledTimes(1);
    });
});
