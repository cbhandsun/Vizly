import React from 'react';
import { Dropdown } from 'antd';
import { getEdgeLabelStyleMenuItems } from '../../diagrams/EdgeLabelStyleMenu';
import type { EdgeLabelStyle } from '../../diagrams/EdgeLabelStyleMenu';

interface EdgeLabelDropdownProps {
    edgeId: string;
    currentStyle: EdgeLabelStyle;
    onStyleChange: (edgeId: string, style: EdgeLabelStyle) => void;
    onResetPosition: () => void;
    children: React.ReactNode;
}

export const EdgeLabelDropdown: React.FC<EdgeLabelDropdownProps> = ({
    edgeId,
    currentStyle,
    onStyleChange,
    onResetPosition,
    children,
}) => (
    <Dropdown
        menu={{
            items: getEdgeLabelStyleMenuItems({
                edgeId,
                currentStyle,
                onStyleChange,
                onResetPosition,
            }),
        }}
        trigger={['contextMenu']}
    >
        {children}
    </Dropdown>
);
