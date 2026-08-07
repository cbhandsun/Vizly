import React from 'react';
import { Select } from 'antd';

import { getViewportPopupContainer } from '../ui/viewportOverlayPortal';
import type { MindMapDirectionKey } from './useMindElixirCanvasPreferences';

const DIRECTION_OPTIONS: Array<{ label: string; value: MindMapDirectionKey }> = [
    { label: '双向展开', value: 'LR' },
    { label: '向右展开', value: 'R' },
    { label: '向左展开', value: 'L' },
];

const getMindMapDirectionLabel = (value: MindMapDirectionKey): string =>
    DIRECTION_OPTIONS.find(option => option.value === value)?.label ?? '双向展开';

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
}) => (
    <Select
        aria-label={`思维导图布局方向，当前${getMindMapDirectionLabel(currentDirection)}`}
        className="mind-elixir-toolbar-direction"
        getPopupContainer={getViewportPopupContainer}
        open={open}
        options={DIRECTION_OPTIONS}
        popupMatchSelectWidth={140}
        size="small"
        value={currentDirection}
        variant="borderless"
        virtual={false}
        onChange={onChange}
        onOpenChange={onOpenChange}
    />
);
