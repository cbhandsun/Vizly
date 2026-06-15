import React from 'react';
import { Dropdown } from 'antd';
import { getEdgeLabelStyleMenuItems } from '../../diagrams/EdgeLabelStyleMenu';

interface EdgeLabelDropdownProps {
    edgeId: string;
    currentStyle: Record<string, any>;
    onStyleChange: (edgeId: string, style: any) => void;
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
