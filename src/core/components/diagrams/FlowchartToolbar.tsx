import React from 'react';
import {
    FaUndo, FaRedo, FaSearchPlus, FaSearchMinus, FaCompressArrowsAlt, FaArrowsAltH,
    FaFileExport, FaFolderOpen, FaMagic, _FaVectorSquare, FaTh, FaKeyboard
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { Tooltip } from 'antd';
import './FlowchartToolbar.css';

interface FlowchartToolbarProps {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitView: () => void;
    onFitWidth?: () => void;
    onExport: () => void;
    onImportClick: () => void;
    autoRouting: boolean;
    toggleAutoRouting: () => void;
    showGrid: boolean;
    toggleGrid: () => void;
    onShowShortcuts: () => void;
}

interface ToolbarButtonProps {
    onClick: () => void;
    disabled?: boolean;
    icon: React.ReactNode;
    title?: string;
    active?: boolean;
    tooltip?: string;
}

const FlowchartToolbar: React.FC<FlowchartToolbarProps> = ({
    canUndo, canRedo, onUndo, onRedo,
    onZoomIn, onZoomOut, onFitView, onFitWidth,
    onExport, onImportClick,
    autoRouting, toggleAutoRouting,
    showGrid, toggleGrid,
    onShowShortcuts
}) => {
    const { t } = useTranslation();
    const onLabel = t('common.on');
    const offLabel = t('common.off');

    const Button = ({ onClick, disabled, icon, title, active, tooltip }: ToolbarButtonProps) => {
        const btn = (
            <button
                onClick={onClick}
                disabled={disabled}
                className={`toolbar-btn ${active ? 'active' : ''}`}
            >
                {icon}
            </button>
        );

        if (tooltip || title) {
            return (
                <Tooltip title={tooltip || title} placement="bottom">
                    {btn}
                </Tooltip>
            );
        }
        return btn;
    };

    return (
        <div className="flowchart-toolbar">
            {/* History */}
            <Button onClick={onUndo} disabled={!canUndo} icon={<FaUndo />} title={t('designer.toolbar.undo')} />
            <Button onClick={onRedo} disabled={!canRedo} icon={<FaRedo />} title={t('designer.toolbar.redo')} />

            <div className="toolbar-separator" />

            {/* View */}
            <Button onClick={onZoomIn} icon={<FaSearchPlus />} title={t('designer.toolbar.zoomIn')} />
            <Button onClick={onZoomOut} icon={<FaSearchMinus />} title={t('designer.toolbar.zoomOut')} />
            <Button onClick={onFitView} icon={<FaCompressArrowsAlt />} title={t('designer.toolbar.fitView')} />
            {onFitWidth && <Button onClick={onFitWidth} icon={<FaArrowsAltH />} title={t('designer.toolbar.fitWidth', '适应宽度')} />}

            <div className="toolbar-separator" />

            {/* Toggles */}
            <Button
                onClick={toggleAutoRouting}
                active={autoRouting}
                icon={<FaMagic />}
                title={`${t('designer.toolbar.autoRouting')} (${autoRouting ? onLabel : offLabel})`}
            />
            <Button
                onClick={toggleGrid}
                active={showGrid}
                icon={<FaTh />}
                title={`${t('designer.toolbar.showGrid')} (${showGrid ? onLabel : offLabel})`}
            />
            <Button
                onClick={onShowShortcuts}
                icon={<FaKeyboard />}
                title={t('designer.toolbar.shortcuts')}
            />

            <div className="toolbar-separator" />

            {/* Actions */}
            <Tooltip title={t('designer.toolbar.import')} placement="left">
                <Button onClick={onImportClick} icon={<FaFolderOpen />} />
            </Tooltip>
            <Tooltip title={t('designer.toolbar.export')} placement="left">
                <Button onClick={onExport} icon={<FaFileExport />} />
            </Tooltip>
        </div>
    );
};

export default FlowchartToolbar;
