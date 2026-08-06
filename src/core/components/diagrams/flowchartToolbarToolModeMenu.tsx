import React from 'react';
import type { MenuProps } from 'antd';
import { FaMousePointer, FaObjectGroup, FaPen, FaSitemap, FaStickyNote } from 'react-icons/fa';

type ToolbarMenuItem = Extract<
    NonNullable<NonNullable<MenuProps['items']>[number]>,
    { type?: 'item' }
>;

type ToolModeMenuItem = ToolbarMenuItem & React.AriaAttributes & {
    role: 'menuitemradio';
};

interface ToolModeMenuLabels {
    drawing: string;
    marquee: string;
    mindMap: string;
    pointer: string;
    stickyNote: string;
}

interface BuildToolModeMenuItemsOptions {
    isDrawingMode?: boolean;
    isMarqueeActive?: boolean;
    labels: ToolModeMenuLabels;
    onActivatePointer?: () => void;
    onAddMindMap?: () => void;
    onAddStickyNote?: () => void;
    onToggleDrawingMode?: () => void;
    toggleSelectionMode?: () => void;
}

const toolModeMenuItem = (item: ToolModeMenuItem): ToolModeMenuItem => item;

export const resolveActiveToolModeKey = (
    isMarqueeActive?: boolean,
    isDrawingMode?: boolean,
): 'pointer' | 'marquee' | 'drawing' => {
    if (isMarqueeActive) return 'marquee';
    if (isDrawingMode) return 'drawing';
    return 'pointer';
};

export const buildToolModeMenuItems = ({
    isDrawingMode,
    isMarqueeActive,
    labels,
    onActivatePointer,
    onAddMindMap,
    onAddStickyNote,
    onToggleDrawingMode,
    toggleSelectionMode,
}: BuildToolModeMenuItemsOptions): NonNullable<MenuProps['items']> => {
    const activeToolModeKey = resolveActiveToolModeKey(isMarqueeActive, isDrawingMode);

    return [
        ...(onActivatePointer ? [toolModeMenuItem({
            key: 'pointer',
            label: labels.pointer,
            icon: <FaMousePointer />,
            onClick: onActivatePointer,
            role: 'menuitemradio',
            'aria-checked': activeToolModeKey === 'pointer',
        })] : []),
        ...(toggleSelectionMode ? [toolModeMenuItem({
            key: 'marquee',
            label: labels.marquee,
            icon: <FaObjectGroup />,
            onClick: toggleSelectionMode,
            role: 'menuitemradio',
            'aria-checked': activeToolModeKey === 'marquee',
        })] : []),
        ...(onToggleDrawingMode ? [toolModeMenuItem({
            key: 'drawing',
            label: labels.drawing,
            icon: <FaPen />,
            onClick: onToggleDrawingMode,
            role: 'menuitemradio',
            'aria-checked': activeToolModeKey === 'drawing',
        })] : []),
        ...(onAddStickyNote ? [{
            key: 'sticky-note',
            label: labels.stickyNote,
            icon: <FaStickyNote />,
            onClick: onAddStickyNote,
        }] : []),
        ...(onAddMindMap ? [{
            key: 'mind-map',
            label: labels.mindMap,
            icon: <FaSitemap />,
            onClick: onAddMindMap,
        }] : []),
    ];
};
