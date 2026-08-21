import type { TFunction } from 'i18next';

import { appMessage } from '../../utils/antdStaticBridge';
import type { MindMapImportFailureReason, MindMapImportStatus } from './useMindElixirImportActions';

const MINDMAP_IMPORT_FEEDBACK_KEY = 'mindmap-import-progress';

const FAILURE_KEYS: Record<MindMapImportFailureReason, string> = {
    aborted: 'mindmapImport.aborted',
    invalid: 'mindmapImport.invalid',
    read: 'mindmapImport.readFailed',
    'scope-changed': 'mindmapImport.scopeChanged',
    'too-large': 'mindmapImport.tooLarge',
};

export const showMindMapImportFeedback = (
    status: MindMapImportStatus,
    t: TFunction,
): void => {
    if (status.kind === 'started') {
        appMessage.loading({
            content: t('mindmapImport.progress', { format: status.format }),
            duration: 0,
            key: MINDMAP_IMPORT_FEEDBACK_KEY,
        });
        return;
    }
    if (status.kind === 'busy') {
        appMessage.warning(t('mindmapImport.inProgress', { format: status.activeFormat }));
        return;
    }

    if (status.kind === 'success') {
        appMessage.success({
            content: t('mindmapImport.success', { format: status.format }),
            key: MINDMAP_IMPORT_FEEDBACK_KEY,
        });
        return;
    }

    appMessage.error({
        content: t(FAILURE_KEYS[status.reason], { format: status.format }),
        key: MINDMAP_IMPORT_FEEDBACK_KEY,
    });
};
