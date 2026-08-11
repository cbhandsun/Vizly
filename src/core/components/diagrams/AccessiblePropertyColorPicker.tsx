import React from 'react';
import { ColorPicker } from 'antd';
import type { Color } from 'antd/es/color-picker';

export type NodeColorField = 'themeColor' | 'main' | 'background' | 'text';

interface AccessiblePropertyColorPickerProps {
    label: string;
    value: string | undefined;
    fallbackValue: string;
    fallbackLabel?: string;
    field: NodeColorField;
    disabled: boolean;
    onColorChange: (color: Color, field: NodeColorField) => void;
}

export const AccessiblePropertyColorPicker: React.FC<AccessiblePropertyColorPickerProps> = ({
    label,
    value,
    fallbackValue,
    fallbackLabel,
    field,
    disabled,
    onColorChange,
}) => {
    const effectiveValue = value ?? fallbackValue;
    const visibleValue = value ?? fallbackLabel ?? fallbackValue;

    return (
        <ColorPicker
            value={effectiveValue}
            onChange={(color) => onColorChange(color, field)}
            disabled={disabled}
        >
            <button
                type="button"
                className="property-color-picker-trigger"
                aria-label={label}
                disabled={disabled}
            >
                <span
                    className="property-color-picker-swatch"
                    style={{ backgroundColor: effectiveValue }}
                    aria-hidden="true"
                />
                <span>{visibleValue}</span>
            </button>
        </ColorPicker>
    );
};
