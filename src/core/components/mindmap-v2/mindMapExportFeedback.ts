import type { TFunction } from 'i18next';

import { appMessage } from '../../utils/antdStaticBridge';
import type { MindMapExportStatus } from './useMindElixirExportActions';

const MINDMAP_EXPORT_FEEDBACK_KEY = 'mindmap-export-progress';

export const showMindMapExportFeedback = (
    status: MindMapExportStatus,
    t: TFunction,
): void => {
    if (status.kind === 'started') {
        appMessage.loading({
            content: t('export.progress', { format: status.format }),
            duration: 0,
            key: MINDMAP_EXPORT_FEEDBACK_KEY,
        });
        return;
    }
    if (status.kind === 'busy') {
        appMessage.warning(t('export.inProgress', { format: status.activeFormat }));
        return;
    }
    if (status.kind === 'print-opened') {
        appMessage.info(t('export.printOpened'));
        return;
    }
    const feedback = t(status.kind === 'error' ? 'export.failed' : 'export.success', {
        format: status.format,
    });
    const message = { content: feedback, key: MINDMAP_EXPORT_FEEDBACK_KEY };
    if (status.kind === 'error') appMessage.error(message);
    else appMessage.success(message);
};
