import React, { useSyncExternalStore } from 'react';
import { HistoryOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import { emitToggleHistory, getHistoryOpen, subscribeToggleHistory } from './mindmapHistoryStore';
import { emitToggleOutline, getOutlineOpen, subscribeOutline } from './mindmapOutlineStore';

const ACTIVE_PANEL_COLOR = '#6366f1';

const MindMapAuxiliaryPanelButtons: React.FC = () => {
    const { t } = useTranslation();
    const isOutlineOpen = useSyncExternalStore(subscribeOutline, getOutlineOpen, getOutlineOpen);
    const isHistoryOpen = useSyncExternalStore(subscribeToggleHistory, getHistoryOpen, getHistoryOpen);

    return (
        <>
            <MindMapToolbarIconButton
                label={t('plugins.mindmap.toolbar.toggleOutline')}
                icon={<UnorderedListOutlined />}
                onClick={emitToggleOutline}
                pressed={isOutlineOpen}
                style={{ color: isOutlineOpen ? ACTIVE_PANEL_COLOR : undefined }}
            />
            <MindMapToolbarIconButton
                label={t('plugins.mindmap.toolbar.toggleHistory')}
                icon={<HistoryOutlined />}
                onClick={emitToggleHistory}
                pressed={isHistoryOpen}
                style={{ color: isHistoryOpen ? ACTIVE_PANEL_COLOR : undefined }}
            />
        </>
    );
};

export default MindMapAuxiliaryPanelButtons;
