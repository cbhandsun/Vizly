import {
    BorderOutlined,
    CheckOutlined,
    GatewayOutlined,
    MinusOutlined,
    RadiusSettingOutlined,
    SelectOutlined,
} from '@ant-design/icons';
import React, { useEffect, useId, useRef, useState } from 'react';

import {
    MIND_MAP_NODE_SHAPE_OPTIONS,
    type MindMapNodeShapeOption,
} from './mindMapNodeShapeOptions';
import { cleanMindMapShapeClass } from './mindmapTreeSanitizer';
import styles from './FloatingBar.module.css';

interface MindMapNodeShapePickerProps {
    currentShape?: unknown;
    onCancel: () => void;
    onSelect: (shape: string | undefined) => Promise<void> | void;
}

const ShapeIcon: React.FC<{ option: MindMapNodeShapeOption }> = ({ option }) => {
    switch (option.icon) {
        case 'oval': return <RadiusSettingOutlined />;
        case 'rect': return <BorderOutlined />;
        case 'underline': return <MinusOutlined />;
        case 'diamond': return <GatewayOutlined />;
        default: return <SelectOutlined />;
    }
};

export const MindMapNodeShapePicker: React.FC<MindMapNodeShapePickerProps> = ({
    currentShape,
    onCancel,
    onSelect,
}) => {
    const titleId = useId();
    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const mountedRef = useRef(true);
    const [pendingValue, setPendingValue] = useState<string | null>(null);
    const selectedShape = cleanMindMapShapeClass(currentShape) ?? '';
    const selectedIndex = Math.max(
        0,
        MIND_MAP_NODE_SHAPE_OPTIONS.findIndex(option => option.value === selectedShape),
    );

    useEffect(() => {
        mountedRef.current = true;
        buttonRefs.current[selectedIndex]?.focus();
        return () => {
            mountedRef.current = false;
        };
    }, [selectedIndex]);

    const runAfterPointerInteraction = (action: () => void) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(action);
            return;
        }
        queueMicrotask(action);
    };

    const selectOption = async (option: MindMapNodeShapeOption) => {
        if (pendingValue !== null) return;
        setPendingValue(option.value || 'default');
        try {
            await onSelect(option.value || undefined);
        } finally {
            if (mountedRef.current) setPendingValue(null);
        }
    };

    const focusOption = (index: number) => {
        const count = MIND_MAP_NODE_SHAPE_OPTIONS.length;
        buttonRefs.current[(index + count) % count]?.focus();
    };

    return (
        <div
            className={styles.shapePopover}
            role="dialog"
            aria-labelledby={titleId}
            aria-busy={pendingValue !== null}
            onPointerDown={event => event.stopPropagation()}
            onPointerUp={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onMouseUp={event => event.stopPropagation()}
            onTouchStart={event => event.stopPropagation()}
            onTouchEnd={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
        >
            <div className={styles.shapeHeader}>
                <strong id={titleId}>节点形状</strong>
                <span>方向键选择 · Esc 关闭</span>
            </div>
            <div className={styles.shapeGrid} role="radiogroup" aria-label="选择节点形状">
                {MIND_MAP_NODE_SHAPE_OPTIONS.map((option, index) => {
                    const isSelected = option.value === selectedShape;
                    const isPending = pendingValue === (option.value || 'default');
                    return (
                        <button
                            ref={element => {
                                buttonRefs.current[index] = element;
                            }}
                            type="button"
                            role="radio"
                            key={option.value || 'default'}
                            className={`${styles.shapeBtn} ${isSelected ? styles.shapeBtnActive : ''}`}
                            title={option.label}
                            aria-label={`节点形状：${option.label}`}
                            aria-checked={isSelected}
                            aria-description={isPending ? '正在应用' : option.description}
                            disabled={pendingValue !== null}
                            tabIndex={isSelected ? 0 : -1}
                            onClick={() => runAfterPointerInteraction(() => void selectOption(option))}
                            onKeyDown={event => {
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    onCancel();
                                    return;
                                }
                                const movement = {
                                    ArrowLeft: -1,
                                    ArrowUp: -1,
                                    ArrowRight: 1,
                                    ArrowDown: 1,
                                } as const;
                                if (event.key in movement) {
                                    event.preventDefault();
                                    focusOption(index + movement[event.key as keyof typeof movement]);
                                    return;
                                }
                                if (event.key === 'Home' || event.key === 'End') {
                                    event.preventDefault();
                                    focusOption(event.key === 'Home' ? 0 : MIND_MAP_NODE_SHAPE_OPTIONS.length - 1);
                                }
                            }}
                        >
                            <span className={styles.shapeIcon} aria-hidden="true">
                                <ShapeIcon option={option} />
                            </span>
                            <span className={styles.shapeText}>
                                <strong>{option.label}</strong>
                                <small>{option.description}</small>
                            </span>
                            {isSelected && <CheckOutlined className={styles.shapeSelectedMark} aria-hidden="true" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
