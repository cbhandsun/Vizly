import React from 'react';
import { Button, Tooltip } from 'antd';
import { FaMousePointer, FaObjectGroup, FaPen, FaSitemap, FaStickyNote } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

interface FlowchartCreationToolsProps {
    isDrawingMode?: boolean;
    isMarqueeActive?: boolean;
    onActivatePointer?: () => void;
    onAddMindMap?: () => void;
    onAddStickyNote?: () => void;
    onToggleDrawingMode?: () => void;
    toggleSelectionMode?: () => void;
}

export const FlowchartCreationTools: React.FC<FlowchartCreationToolsProps> = ({
    isDrawingMode,
    isMarqueeActive,
    onActivatePointer,
    onAddMindMap,
    onAddStickyNote,
    onToggleDrawingMode,
    toggleSelectionMode,
}) => {
    const { t } = useTranslation();
    const pointerActive = !isDrawingMode && !isMarqueeActive;
    const pointerLabel = t('designer.toolbar.pointer', '普通选择器 (V)');
    const marqueeLabel = isMarqueeActive
        ? t('designer.toolbar.marqueeExit', '退出框选 (Esc)')
        : t('designer.toolbar.marqueeEnter', '框选模式 (M)');
    const drawingLabel = isDrawingMode
        ? t('designer.toolbar.drawingModeExit', '退出自由画笔 (Esc)')
        : t('designer.toolbar.drawingMode', '自由画笔 (P)');

    return (
        <div className="flex items-center gap-1.5 p-1">
            <div className="flex items-center gap-1">
                <Tooltip title={pointerLabel}>
                    <Button
                        type="text"
                        onClick={onActivatePointer}
                        aria-label={pointerLabel}
                        aria-pressed={pointerActive}
                        icon={<FaMousePointer className={`text-[12px] ${pointerActive ? 'text-indigo-500' : 'text-slate-500'}`} />}
                        className={`w-9 h-9 p-0 border-none transition-all ${pointerActive ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`}
                    />
                </Tooltip>
                <Tooltip title={marqueeLabel}>
                    <Button
                        type="text"
                        onClick={toggleSelectionMode}
                        aria-label={marqueeLabel}
                        aria-pressed={isMarqueeActive}
                        icon={<FaObjectGroup className={`text-[14px] ${isMarqueeActive ? 'text-indigo-500' : 'text-slate-500'}`} />}
                        className={`w-9 h-9 p-0 border-none transition-all ${isMarqueeActive ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`}
                    />
                </Tooltip>
                <Tooltip title={drawingLabel}>
                    <Button
                        type="text"
                        onClick={onToggleDrawingMode}
                        aria-label={drawingLabel}
                        aria-pressed={isDrawingMode}
                        icon={<FaPen className={`text-[13px] ${isDrawingMode ? 'text-indigo-500' : 'text-slate-500'}`} />}
                        className={`w-9 h-9 p-0 border-none transition-all ${isDrawingMode ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`}
                    />
                </Tooltip>
            </div>

            <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />

            <div className="flex items-center gap-1">
                <Tooltip title={t('designer.toolbar.stickyNote', '便签 (S)')}>
                    <Button type="text" aria-label={t('designer.toolbar.stickyNote', '便签 (S)')} onClick={onAddStickyNote} icon={<FaStickyNote className="text-[14px] text-amber-500" />} className="w-9 h-9 p-0 border-none hover:bg-slate-200 dark:hover:bg-white/5" />
                </Tooltip>
                <Tooltip title={t('designer.toolbar.mindMap', '思维导图 (Shift+M)')}>
                    <Button type="text" aria-label={t('designer.toolbar.mindMap', '思维导图 (Shift+M)')} onClick={onAddMindMap} icon={<FaSitemap className="text-[14px] text-sky-500" />} className="w-9 h-9 p-0 border-none hover:bg-slate-200 dark:hover:bg-white/5" />
                </Tooltip>
            </div>
        </div>
    );
};
