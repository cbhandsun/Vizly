import React, { useCallback, useEffect, useRef } from 'react';
import { Button, Tooltip } from 'antd';
import { FaHistory, FaRedo, FaUndo } from 'react-icons/fa';

import {
    scheduleFlowchartToolbarHistoryFocus,
    type FlowchartToolbarHistoryAction,
} from './flowchartToolbarHistoryFocus';

interface FlowchartHistoryToolbarControlsProps {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onShowHistory?: () => void;
    undoLabel: string;
    redoLabel: string;
    historyLabel: string;
    buttonClassName: string;
    disabledButtonClassName: string;
    dividerClassName: string;
    showHistory: boolean;
}

export const FlowchartHistoryToolbarControls: React.FC<FlowchartHistoryToolbarControlsProps> = ({
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onShowHistory,
    undoLabel,
    redoLabel,
    historyLabel,
    buttonClassName,
    disabledButtonClassName,
    dividerClassName,
    showHistory,
}) => {
    const undoRef = useRef<HTMLButtonElement>(null);
    const redoRef = useRef<HTMLButtonElement>(null);
    const historyRef = useRef<HTMLButtonElement>(null);
    const pendingFocusRef = useRef<{ cancel: () => void } | null>(null);

    const scheduleFocus = useCallback((action: FlowchartToolbarHistoryAction) => {
        const origin = action === 'undo' ? undoRef.current : redoRef.current;
        pendingFocusRef.current?.cancel();
        pendingFocusRef.current = scheduleFlowchartToolbarHistoryFocus(action, origin, () => ({
            undo: undoRef.current,
            redo: redoRef.current,
            history: historyRef.current,
        }));
    }, []);

    const handleUndo = useCallback(() => {
        onUndo();
        scheduleFocus('undo');
    }, [onUndo, scheduleFocus]);
    const handleRedo = useCallback(() => {
        onRedo();
        scheduleFocus('redo');
    }, [onRedo, scheduleFocus]);

    useEffect(() => () => pendingFocusRef.current?.cancel(), []);

    return (
        <>
            <Tooltip title={undoLabel}>
                <Button
                    ref={undoRef}
                    type="text"
                    aria-label={undoLabel}
                    icon={<FaUndo size={13} />}
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className={canUndo ? buttonClassName : disabledButtonClassName}
                />
            </Tooltip>
            {onShowHistory && showHistory && (
                <Tooltip title={historyLabel}>
                    <Button
                        ref={historyRef}
                        type="text"
                        aria-label={historyLabel}
                        icon={<FaHistory size={13} />}
                        onClick={onShowHistory}
                        className={buttonClassName}
                    />
                </Tooltip>
            )}
            <Tooltip title={redoLabel}>
                <Button
                    ref={redoRef}
                    type="text"
                    aria-label={redoLabel}
                    icon={<FaRedo size={13} />}
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className={canRedo ? buttonClassName : disabledButtonClassName}
                />
            </Tooltip>
            <div className={dividerClassName} />
        </>
    );
};
