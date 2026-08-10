import { appModal } from '@/core/utils/antdStaticBridge';
import { COMMERCIAL_VIEWPORT_MODAL_CLASS } from '@/core/components/ui/viewportOverlayPortal';
import i18n from '@/i18n';
import { logDiagramViewerSwitchConfirmationFailure } from './diagramViewerLogging';

type SwitchConfirmationTranslationKey =
    | 'diagramViewer.switcher.confirmTitle'
    | 'diagramViewer.switcher.confirmContent'
    | 'diagramViewer.switcher.confirmAction'
    | 'common.cancel';

type SwitchConfirmationTranslator = (
    key: SwitchConfirmationTranslationKey,
    options?: { nodeCount: number },
) => string;

interface ConfirmSwitchOptions {
    nodeCount: number;
    confirmModal?: Pick<typeof appModal, 'confirm'>;
    translate?: SwitchConfirmationTranslator;
}

interface EnsureSwitchConfirmationOptions {
    getCurrentNodeCount: () => Promise<number>;
    confirmSwitch?: (options: ConfirmSwitchOptions) => Promise<boolean>;
    logFailure?: (error: unknown) => void;
}

const translateSwitchConfirmation: SwitchConfirmationTranslator = (key, options) => (
    i18n.t(key, options)
);

const isValidNodeCount = (nodeCount: number): boolean => (
    Number.isSafeInteger(nodeCount) && nodeCount >= 0
);

const getDiagramSwitcherFocusReturnTarget = (): HTMLElement | null => {
    if (typeof document === 'undefined') return null;

    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return null;

    const switcherSurface = activeElement.closest<HTMLElement>(
        '[data-diagram-switcher-surface="true"]',
    );
    if (!switcherSurface?.id) {
        return activeElement.isConnected ? activeElement : null;
    }

    return Array.from(document.querySelectorAll<HTMLElement>('[aria-controls]')).find(
        (element) => element.getAttribute('aria-controls') === switcherSurface.id,
    ) ?? (activeElement.isConnected ? activeElement : null);
};

export const confirmDiagramTemplateSwitch = async ({
    nodeCount,
    confirmModal = appModal,
    translate = translateSwitchConfirmation,
}: ConfirmSwitchOptions): Promise<boolean> => {
    if (!isValidNodeCount(nodeCount)) return false;
    if (nodeCount <= 0) return true;

    const focusReturnTarget = getDiagramSwitcherFocusReturnTarget();
    let restoreFocusAfterClose = false;

    return await new Promise<boolean>((resolve) => {
        confirmModal.confirm({
            title: translate('diagramViewer.switcher.confirmTitle'),
            content: translate('diagramViewer.switcher.confirmContent', { nodeCount }),
            okText: translate('diagramViewer.switcher.confirmAction'),
            cancelText: translate('common.cancel'),
            okButtonProps: { danger: true },
            autoFocusButton: 'cancel',
            rootClassName: COMMERCIAL_VIEWPORT_MODAL_CLASS,
            onOk: () => resolve(true),
            onCancel: () => {
                restoreFocusAfterClose = true;
                resolve(false);
            },
            afterClose: () => {
                if (restoreFocusAfterClose && focusReturnTarget?.isConnected) {
                    focusReturnTarget.focus();
                }
            },
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
        if (!isValidNodeCount(currentNodeCount)) {
            throw new TypeError('Invalid current diagram node count');
        }
        if (currentNodeCount <= 0) return true;
        return await confirmSwitch({ nodeCount: currentNodeCount });
    } catch (error) {
        logFailure(error);
        return false;
    }
};
