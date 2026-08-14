import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { MindElixirInstance } from 'mind-elixir';

import { applyMindMapTreeExpansionTransaction } from './mindmapTreeExpansion';
import { logMindmapToolbarTreeExpansionFailure } from './mindmapToolbarLogging';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import { useMindMapTreeExpansionAvailability } from './useMindMapTreeExpansionAvailability';

interface MindMapTreeExpansionButtonsProps {
    mind: MindElixirInstance | null;
}

const MindMapTreeExpansionButtons = ({ mind }: MindMapTreeExpansionButtonsProps) => {
    const { t } = useTranslation();
    const availability = useMindMapTreeExpansionAvailability(mind);

    const handleCollapseAll = useCallback(() => {
        if (!mind || !availability.canCollapse) return;
        try {
            applyMindMapTreeExpansionTransaction(mind, false);
        } catch (error) {
            logMindmapToolbarTreeExpansionFailure('collapseAll', error);
        }
    }, [availability.canCollapse, mind]);

    const handleExpandAll = useCallback(() => {
        if (!mind || !availability.canExpand) return;
        try {
            applyMindMapTreeExpansionTransaction(mind, true);
        } catch (error) {
            logMindmapToolbarTreeExpansionFailure('expandAll', error);
        }
    }, [availability.canExpand, mind]);

    return (
        <>
            <MindMapToolbarIconButton
                label={t('plugins.mindmap.collapseAll')}
                icon={<MenuFoldOutlined />}
                onClick={handleCollapseAll}
                disabled={!availability.canCollapse}
            />
            <MindMapToolbarIconButton
                label={t('plugins.mindmap.expandAll')}
                icon={<MenuUnfoldOutlined />}
                onClick={handleExpandAll}
                disabled={!availability.canExpand}
            />
        </>
    );
};

export default MindMapTreeExpansionButtons;
