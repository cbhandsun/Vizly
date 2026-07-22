// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
    confirmDiagramTemplateSwitch,
    ensureDiagramSwitchConfirmed,
} from '../diagramViewerSwitchGuard';

describe('diagramViewerSwitchGuard', () => {
    it('skips the modal when there are no current nodes', async () => {
        const confirm = vi.fn();

        await expect(confirmDiagramTemplateSwitch({
            nodeCount: 0,
            confirmModal: { confirm },
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
        })).resolves.toBe(true);

        await expect(confirmDiagramTemplateSwitch({
            nodeCount: 2,
            confirmModal: { confirm: confirmReject },
        })).resolves.toBe(false);

        expect(confirmApprove).toHaveBeenCalledWith(expect.objectContaining({
            title: '切换图表模板',
            okText: '确定切换',
            cancelText: '取消',
            okButtonProps: { danger: true },
        }));
        expect(confirmApprove).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('3 个节点'),
        }));
        expect(confirmReject).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('2 个节点'),
        }));
    });

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

    it('continues without blocking when reading node state fails', async () => {
        const logFailure = vi.fn();

        await expect(ensureDiagramSwitchConfirmed({
            getCurrentNodeCount: vi.fn().mockRejectedValue(new Error('store read failed')),
            confirmSwitch: vi.fn(),
            logFailure,
        })).resolves.toBe(true);

        expect(logFailure).toHaveBeenCalledWith(expect.any(Error));
    });
});
