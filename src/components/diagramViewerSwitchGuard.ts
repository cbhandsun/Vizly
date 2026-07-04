import { appModal } from '@/core/utils/antdStaticBridge';
import { logDiagramViewerSwitchConfirmationFailure } from './diagramViewerLogging';

interface ConfirmSwitchOptions {
    nodeCount: number;
    confirmModal?: Pick<typeof appModal, 'confirm'>;
}

interface EnsureSwitchConfirmationOptions {
    getCurrentNodeCount: () => Promise<number>;
    confirmSwitch?: (options: ConfirmSwitchOptions) => Promise<boolean>;
    logFailure?: (error: unknown) => void;
}

export const confirmDiagramTemplateSwitch = async ({
    nodeCount,
    confirmModal = appModal,
}: ConfirmSwitchOptions): Promise<boolean> => {
    if (nodeCount <= 0) return true;

    return await new Promise<boolean>((resolve) => {
        confirmModal.confirm({
            title: '切换图表模板',
            content: `当前图表包含 ${nodeCount} 个节点。切换后当前的本地修改将被新模板覆盖，确定要继续吗？`,
            okText: '确定切换',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
};

export const ensureDiagramSwitchConfirmed = async ({
    getCurrentNodeCount,
    confirmSwitch = confirmDiagramTemplateSwitch,
    logFailure = logDiagramViewerSwitchConfirmationFailure,
}: EnsureSwitchConfirmationOptions): Promise<boolean> => {
    try {
        const currentNodeCount = await getCurrentNodeCount();
        if (currentNodeCount <= 0) return true;
        return await confirmSwitch({ nodeCount: currentNodeCount });
    } catch (error) {
        logFailure(error);
        return true;
    }
};
