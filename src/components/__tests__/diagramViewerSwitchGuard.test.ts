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
        const confirmApprove = vi.fn(({ onOk }: { onOk?: () => void }) => onOk?.());
        const confirmReject = vi.fn(({ onCancel }: { onCancel?: () => void }) => onCancel?.());

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
        expect(confirmApprove.mock.calls[0]?.[0]?.content).toContain('3 个节点');
        expect(confirmReject.mock.calls[0]?.[0]?.content).toContain('2 个节点');
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
