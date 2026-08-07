import React, { useEffect, useId, useRef, useState } from 'react';

import {
    MIND_MAP_BRANCH_COLOR_OPTIONS,
    type BranchColorOption,
} from './mindMapBranchColorOptions';
import { cleanMindMapColor } from './mindmapTreeSanitizer';
import styles from './FloatingBar.module.css';

interface MindMapBranchColorPickerProps {
    currentColor?: string;
    onCancel: () => void;
    onSelect: (color: string | undefined) => Promise<void> | void;
}

const optionName = ({ label, value }: BranchColorOption): string =>
    value ? `${label}（${value}）` : label;

export const MindMapBranchColorPicker: React.FC<MindMapBranchColorPickerProps> = ({
    currentColor,
    onCancel,
    onSelect,
}) => {
    const titleId = useId();
    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const mountedRef = useRef(true);
    const [pendingValue, setPendingValue] = useState<string | null>(null);
    const selectedColor = cleanMindMapColor(currentColor);
    const selectedIndex = Math.max(
        0,
        MIND_MAP_BRANCH_COLOR_OPTIONS.findIndex(option => option.value === selectedColor),
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

    const selectOption = async (option: BranchColorOption) => {
        if (pendingValue !== null) return;
        setPendingValue(option.value ?? 'inherit');
        try {
            await onSelect(option.value);
        } finally {
            if (mountedRef.current) setPendingValue(null);
        }
    };

    const focusOption = (index: number) => {
        const count = MIND_MAP_BRANCH_COLOR_OPTIONS.length;
        buttonRefs.current[(index + count) % count]?.focus();
    };

    return (
        <div
            className={styles.colorPopover}
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
            <div className={styles.colorHeader}>
                <strong id={titleId}>连线颜色</strong>
                <span>方向键选择 · Esc 关闭</span>
            </div>
            <div className={styles.colorGrid} role="radiogroup" aria-label="选择连线颜色">
                {MIND_MAP_BRANCH_COLOR_OPTIONS.map((option, index) => {
                    const isSelected = option.value === selectedColor;
                    const isPending = pendingValue === (option.value ?? 'inherit');
                    return (
                        <button
                            ref={element => {
                                buttonRefs.current[index] = element;
                            }}
                            type="button"
                            role="radio"
                            key={option.value ?? 'inherit'}
                            className={`${styles.colorItem} ${isSelected ? styles.colorItemSelected : ''}`}
                            title={optionName(option)}
                            aria-label={`连线颜色：${optionName(option)}`}
                            aria-checked={isSelected}
                            aria-description={isPending ? '正在应用' : undefined}
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
                                    focusOption(event.key === 'Home' ? 0 : MIND_MAP_BRANCH_COLOR_OPTIONS.length - 1);
                                }
                            }}
                            style={option.value ? { background: option.value } : undefined}
                        >
                            {!option.value && <span className={styles.colorInheritMark} aria-hidden="true">↗</span>}
                            {isSelected && <span className={styles.colorSelectedMark} aria-hidden="true">✓</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
