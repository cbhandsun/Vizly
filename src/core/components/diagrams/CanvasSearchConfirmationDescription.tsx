import React from 'react';

interface CanvasSearchConfirmationDescriptionProps {
    description: string;
    mapping: string;
}

export const CanvasSearchConfirmationDescription: React.FC<CanvasSearchConfirmationDescriptionProps> = ({
    description,
    mapping,
}) => (
    <div>
        <div>{description}</div>
        <div style={{ marginTop: 4, overflowWrap: 'anywhere' }}>{mapping}</div>
    </div>
);
