import { AimOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MindElixirInstance } from 'mind-elixir';

import { getMindMapFocusAvailability } from './mindMapFocusAvailability';
import { logMindmapToolbarFocusModeFailure } from './mindmapToolbarLogging';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import { useMindMapFocusMode } from './useMindMapFocusMode';
import { useMindMapPropertySelection } from './useMindMapPropertySelection';

interface MindMapFocusButtonProps {
    mind: MindElixirInstance | null;
}

const MindMapFocusButton = ({ mind }: MindMapFocusButtonProps) => {
    const { t } = useTranslation();
    const selectedNode = useMindMapPropertySelection(mind);
    const availability = getMindMapFocusAvailability(mind, selectedNode);
    const { isFocused, toggleFocusMode } = useMindMapFocusMode(
        mind,
        logMindmapToolbarFocusModeFailure,
    );

    const handleFocusMode = () => {
        try {
            toggleFocusMode(selectedNode?.id);
        } catch (error) {
            logMindmapToolbarFocusModeFailure(error);
        }
    };

    return (
        <MindMapToolbarIconButton
            label={t(isFocused ? 'plugins.mindmap.toolbar.exitFocus' : 'plugins.mindmap.toolbar.enterFocus')}
            icon={<AimOutlined />}
            onClick={handleFocusMode}
            disabled={!isFocused && !availability.enabled}
            pressed={isFocused}
            style={{ color: isFocused ? '#6366f1' : undefined }}
        />
    );
};

export default MindMapFocusButton;
