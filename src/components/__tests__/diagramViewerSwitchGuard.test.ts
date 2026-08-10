// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
    confirmDiagramTemplateSwitch,
    ensureDiagramSwitchConfirmed,
} from '../diagramViewerSwitchGuard';

describe('diagramViewerSwitchGuard', () => {
    const translations = {
        'diagramViewer.switcher.confirmTitle': 'Replace the current page?',
        'diagramViewer.switcher.confirmContent': 'The current page contains nodes.',
        'diagramViewer.switcher.confirmAction': 'Replace page',
        'common.cancel': 'Cancel',
    } as const;
    const translate = vi.fn((
        key: keyof typeof translations,
        options?: { nodeCount: number },
    ) => (
        key === 'diagramViewer.switcher.confirmContent'
            ? `The current page contains ${options?.nodeCount} nodes.`
            : translations[key]
    ));

    it('skips the modal when there are no current nodes', async () => {
        const confirm = vi.fn();

        await expect(confirmDiagramTemplateSwitch({
            nodeCount: 0,
            confirmModal: { confirm },
            translate,
        })).resolves.toBe(true);

        expect(confirm).not.toHaveBeenCalled();
    });

    it('opens a destructive confirmation modal and resolves based on user action', async () => {
        type ConfirmFunction = NonNullable<
            Parameters<typeof confirmDiagramTemplateSwitch>[0]['confirmModal']
        >['confirm'];
        const modalResult = () => ({ destroy: vi.fn(), update: vi.fn() });
        const confirmApprove = vi.fn<ConfirmFunction>((options) => {
            void options.onOk?.();
            return modalResult();
        });
        const confirmReject = vi.fn<ConfirmFunction>((options) => {
            void options.onCancel?.();
            return modalResult();
        });

        await expect(confirmDiagramTemplateSwitch({
            nodeCount: 3,
            confirmModal: { confirm: confirmApprove },
            translate,
        })).resolves.toBe(true);

        await expect(confirmDiagramTemplateSwitch({
            nodeCount: 2,
            confirmModal: { confirm: confirmReject },
            translate,
        })).resolves.toBe(false);

        expect(confirmApprove).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Replace the current page?',
            okText: 'Replace page',
            cancelText: 'Cancel',
            okButtonProps: { danger: true },
            autoFocusButton: 'cancel',
            rootClassName: 'commercial-viewport-modal',
        }));
        expect(confirmApprove).toHaveBeenCalledWith(expect.objectContaining({
            content: 'The current page contains 3 nodes.',
        }));
        expect(confirmReject).toHaveBeenCalledWith(expect.objectContaining({
            content: 'The current page contains 2 nodes.',
        }));
    });

    it('restores the toolbar trigger after a cancelled switch finishes closing', async () => {
        type ConfirmFunction = NonNullable<
            Parameters<typeof confirmDiagramTemplateSwitch>[0]['confirmModal']
        >['confirm'];
        type ConfirmOptions = Parameters<ConfirmFunction>[0];
        let confirmOptions: ConfirmOptions | undefined;
        const trigger = document.createElement('button');
        trigger.setAttribute('aria-controls', 'diagram-switcher-test');
        const surface = document.createElement('div');
        surface.id = 'diagram-switcher-test';
        surface.dataset.diagramSwitcherSurface = 'true';
        const input = document.createElement('input');
        surface.appendChild(input);
        document.body.append(trigger, surface);
        input.focus();

        const confirm = vi.fn<ConfirmFunction>((options) => {
            confirmOptions = options;
            return { destroy: vi.fn(), update: vi.fn() };
        });
        const result = confirmDiagramTemplateSwitch({
            nodeCount: 2,
            confirmModal: { confirm },
            translate,
        });

        await confirmOptions?.onCancel?.();
        confirmOptions?.afterClose?.();

        await expect(result).resolves.toBe(false);
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
        surface.remove();
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
        'fails closed for an invalid node count of %s',
        async (nodeCount) => {
            const confirm = vi.fn();

            await expect(confirmDiagramTemplateSwitch({
                nodeCount,
                confirmModal: { confirm },
                translate,
            })).resolves.toBe(false);

            expect(confirm).not.toHaveBeenCalled();
        },
    );

    it('checks current node count and delegates to the confirmation step', async () => {
        const getCurrentNodeCount = vi.fn().mockResolvedValue(5);
        const confirmSwitch = vi.fn().mockResolvedValue(false);

        await expect(ensureDiagramSwitchConfirmed({
            getCurrentNodeCount,
            confirmSwitch,
        })).resolves.toBe(false);

        expect(getCurrentNodeCount).toHaveBeenCalled();
        expect(confirmSwitch).toHaveBeenCalledWith({ nodeCount: 5 });
    });

    it('blocks switching when reading node state fails', async () => {
        const logFailure = vi.fn();
        const confirmSwitch = vi.fn();

        await expect(ensureDiagramSwitchConfirmed({
            getCurrentNodeCount: vi.fn().mockRejectedValue(new Error('store read failed')),
            confirmSwitch,
            logFailure,
        })).resolves.toBe(false);

        expect(logFailure).toHaveBeenCalledWith(expect.any(Error));
        expect(confirmSwitch).not.toHaveBeenCalled();
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5])(
        'blocks switching and logs an invalid node-state count of %s',
        async (nodeCount) => {
            const logFailure = vi.fn();
            const confirmSwitch = vi.fn();

            await expect(ensureDiagramSwitchConfirmed({
                getCurrentNodeCount: vi.fn().mockResolvedValue(nodeCount),
                confirmSwitch,
                logFailure,
            })).resolves.toBe(false);

            expect(logFailure).toHaveBeenCalledWith(expect.any(TypeError));
            expect(confirmSwitch).not.toHaveBeenCalled();
        },
    );
});
