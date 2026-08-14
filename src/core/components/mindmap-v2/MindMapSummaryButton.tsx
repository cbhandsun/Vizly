import { BranchesOutlined } from '@ant-design/icons';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { MindElixirInstance } from 'mind-elixir';

import { appMessage } from '@/core/utils/antdStaticBridge';
import { createMindMapSummaryForSelection } from './mindMapSummaryCreation';
import { getMindMapSummaryAvailability } from './mindMapSummaryAvailability';
import { logMindmapToolbarSummaryFailure } from './mindmapToolbarLogging';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import { useMindMapPropertySelection } from './useMindMapPropertySelection';

interface MindMapSummaryButtonProps {
    mind: MindElixirInstance | null;
}

const MindMapSummaryButton = ({ mind }: MindMapSummaryButtonProps) => {
    const { t } = useTranslation();
    const selectedNode = useMindMapPropertySelection(mind);
    const availability = getMindMapSummaryAvailability(mind, selectedNode);

    const handleCreateSummary = useCallback(() => {
        if (!mind || !availability.enabled) return;
        const result = createMindMapSummaryForSelection(mind, selectedNode?.id);
        if (result.ok) {
            appMessage.success(result.message);
            return;
        }
        if (result.error) logMindmapToolbarSummaryFailure(result.error);
        if (result.code === 'create-failed') appMessage.error(result.message);
        else appMessage.warning(result.message);
    }, [availability.enabled, mind, selectedNode?.id]);

    return (
        <MindMapToolbarIconButton
            label={t('plugins.mindmap.toolbar.createSummary')}
            icon={<BranchesOutlined />}
            onClick={handleCreateSummary}
            disabled={!availability.enabled}
        />
    );
};

export default MindMapSummaryButton;
