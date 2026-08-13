import React from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';

import { getViewportPopupContainer } from '../ui/viewportOverlayPortal';
import type { MindMapDirectionKey } from './useMindElixirCanvasPreferences';

const DIRECTION_OPTIONS: Array<{ key: string; value: MindMapDirectionKey }> = [
    { key: 'twoWay', value: 'LR' },
    { key: 'right', value: 'R' },
    { key: 'left', value: 'L' },
];

interface MindMapDirectionSelectorProps {
    currentDirection: MindMapDirectionKey;
    onChange: (value: MindMapDirectionKey) => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}

export const MindMapDirectionSelector: React.FC<MindMapDirectionSelectorProps> = ({
    currentDirection,
    onChange,
    onOpenChange,
    open,
}) => {
    const { t } = useTranslation();
    const options = DIRECTION_OPTIONS.map(option => ({
        label: t(`plugins.mindmap.toolbar.direction.${option.key}`),
        value: option.value,
    }));
    const currentLabel = options.find(option => option.value === currentDirection)?.label
        ?? t('plugins.mindmap.toolbar.direction.twoWay');

    return (
    <Select
        aria-label={t('plugins.mindmap.toolbar.direction.current', { direction: currentLabel })}
        className="mind-elixir-toolbar-direction"
        getPopupContainer={getViewportPopupContainer}
        open={open}
        options={options}
        popupMatchSelectWidth={140}
        size="small"
        value={currentDirection}
        variant="borderless"
        virtual={false}
        onChange={onChange}
        onOpenChange={onOpenChange}
    />
    );
};
