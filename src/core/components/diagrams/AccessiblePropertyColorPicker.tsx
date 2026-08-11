import React, { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ColorPicker } from 'antd';
import type { Color } from 'antd/es/color-picker';

export type NodeColorField = 'themeColor' | 'main' | 'background' | 'text';

export interface PropertyColorPickerPanelLabels {
    editor: string;
    hue: string;
    alpha: string;
    format: string;
    value: string;
}

interface AccessiblePropertyColorPickerProps {
    label: string;
    value: string | undefined;
    fallbackValue: string;
    fallbackLabel?: string;
    mixed: boolean;
    mixedLabel: string;
    panelLabels: PropertyColorPickerPanelLabels;
    field: NodeColorField;
    disabled: boolean;
    onColorChange: (color: Color, field: NodeColorField) => void;
}

interface AccessibleColorPickerPanelProps {
    label: string;
    labels: PropertyColorPickerPanelLabels;
    panel: ReactNode;
    onRequestClose: () => void;
}

const AccessibleColorPickerPanel: React.FC<AccessibleColorPickerPanelProps> = ({
    label,
    labels,
    panel,
    onRequestClose,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const panelElement = panelRef.current;
        if (!panelElement) return;

        const sliders = panelElement.querySelectorAll<HTMLElement>('[role="slider"]');
        const formatInput = panelElement.querySelector<HTMLElement>('.ant-color-picker-format-select input');
        const valueInput = panelElement.querySelector<HTMLElement>('.ant-color-picker-hex-input input');
        const alphaInput = panelElement.querySelector<HTMLElement>('.ant-color-picker-alpha-input input');

        sliders[0]?.setAttribute('aria-label', `${label}: ${labels.hue}`);
        sliders[1]?.setAttribute('aria-label', `${label}: ${labels.alpha}`);
        formatInput?.setAttribute('aria-label', `${label}: ${labels.format}`);
        valueInput?.setAttribute('aria-label', `${label}: ${labels.value}`);
        alphaInput?.setAttribute('aria-label', `${label}: ${labels.alpha}`);
    }, [label, labels]);

    return (
        <div
            ref={panelRef}
            role="group"
            aria-label={`${label}: ${labels.editor}`}
            data-preserve-dialog-on-escape="true"
            onKeyDownCapture={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                onRequestClose();
            }}
        >
            {panel}
        </div>
    );
};

export const AccessiblePropertyColorPicker: React.FC<AccessiblePropertyColorPickerProps> = ({
    label,
    value,
    fallbackValue,
    fallbackLabel,
    mixed,
    mixedLabel,
    panelLabels,
    field,
    disabled,
    onColorChange,
}) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const restoreFocusOnCloseRef = useRef(false);
    const effectiveValue = value ?? fallbackValue;
    const visibleValue = mixed ? mixedLabel : (value ?? fallbackLabel ?? fallbackValue);
    const accessibleLabel = mixed ? `${label}: ${mixedLabel}` : label;

    const handleOpenChange = (nextOpen: boolean) => {
        restoreFocusOnCloseRef.current = open && !nextOpen;
        setOpen(nextOpen);
    };

    useLayoutEffect(() => {
        if (open || !restoreFocusOnCloseRef.current) return;

        restoreFocusOnCloseRef.current = false;
        const trigger = triggerRef.current;
        if (trigger?.isConnected && !disabled) {
            trigger.focus();
        }
    }, [disabled, open]);

    return (
        <ColorPicker
            open={open}
            onOpenChange={handleOpenChange}
            value={effectiveValue}
            onChange={(color) => onColorChange(color, field)}
            disabled={disabled}
            panelRender={(panel) => (
                <AccessibleColorPickerPanel
                    label={label}
                    labels={panelLabels}
                    panel={panel}
                    onRequestClose={() => handleOpenChange(false)}
                />
            )}
        >
            <button
                ref={triggerRef}
                type="button"
                className={`property-color-picker-trigger${mixed ? ' mixed' : ''}`}
                aria-label={accessibleLabel}
                data-mixed={mixed || undefined}
                disabled={disabled}
            >
                <span
                    className="property-color-picker-swatch"
                    style={{ backgroundColor: mixed ? 'transparent' : effectiveValue }}
                    aria-hidden="true"
                />
                <span>{visibleValue}</span>
            </button>
        </ColorPicker>
    );
};
