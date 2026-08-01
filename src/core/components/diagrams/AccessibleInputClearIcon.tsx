import React from 'react';
import { CloseCircleFilled } from '@ant-design/icons';

const visuallyHiddenStyle: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
};

interface AccessibleInputClearIconProps {
    label: string;
}

export const AccessibleInputClearIcon: React.FC<AccessibleInputClearIconProps> = ({ label }) => (
    <>
        <CloseCircleFilled aria-hidden="true" />
        <span style={visuallyHiddenStyle}>{label}</span>
    </>
);
