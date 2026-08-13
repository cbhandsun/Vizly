/**
 * MindMapBatchBar.tsx — 多节点批量操作浮动条
 *
 * 当用户通过 Ctrl+Click 选中多个节点时，底部弹出批量操作条：
 *  - 显示已选节点数量
 *  - 批量设置颜色（连线色）
 *  - 批量折叠 / 展开
 *  - 批量删除（带确认）
 *
 * 设计参考：Whimsical / Figma 多选操作栏
 */

import React, { useCallback, useEffect, useId, useState } from 'react';
import { Popover, Tooltip, Popconfirm } from 'antd';
import { ChevronDown, ChevronRight, Palette, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMindElixirInstance } from './mindElixirStore';
import type { NodeObj, Topic } from 'mind-elixir';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { logMindMapBatchActionFailure } from './mindmapBatchLogging';
import './MindMapBatchBar.css';

// ─── Quick palette for batch colour ──────────────────────────────────────────
const BATCH_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#64748b',
];

interface BatchState {
    count: number;
    nodeObjs: NodeObj[];
}

const EMPTY: BatchState = { count: 0, nodeObjs: [] };

const getSelectedElements = (
    mind: NonNullable<ReturnType<typeof getMindElixirInstance>>,
    nodes: NodeObj[],
): Topic[] => nodes
    .map(node => mind.findEle(node.id))
    .filter((element): element is Topic => Boolean(element));

const MindMapBatchBar: React.FC = () => {
    const { t } = useTranslation();
    const [batch, setBatch] = useState<BatchState>(EMPTY);
    const [colorOpen, setColorOpen] = useState(false);
    const colorPanelId = useId();

    const mind = getMindElixirInstance();

    useEffect(() => {
        if (!mind) return;

        const onSelectNodes = (objs: NodeObj[]) => {
            if (!objs || objs.length < 2) {
                setBatch(EMPTY);
                return;
            }
            setBatch({ count: objs.length, nodeObjs: objs });
        };

        const onUnselect = () => { setBatch(EMPTY); setColorOpen(false); };

        mind.bus.addListener('selectNodes', onSelectNodes);
        mind.bus.addListener('unselectNodes', onUnselect);

        return () => {
            mind.bus.removeListener('selectNodes', onSelectNodes);
            mind.bus.removeListener('unselectNodes', onUnselect);
        };
    }, [mind]);

    const handleBatchColor = useCallback((color: string) => {
        if (!mind) return;
        getSelectedElements(mind, batch.nodeObjs).forEach(el => {
            const obj = batch.nodeObjs.find(node => node.id === el.dataset?.nodeid);
            if (obj) {
                try {
                    mind.reshapeNode(el, { ...obj, ...cleanMindMapNodePatch({ branchColor: color }) });
                } catch (error) {
                    logMindMapBatchActionFailure('reshapeNode', error);
                }
            }
        });
        setColorOpen(false);
    }, [mind, batch]);

    const handleBatchExpand = useCallback((expand: boolean) => {
        if (!mind) return;
        getSelectedElements(mind, batch.nodeObjs).forEach(el => {
            try {
                mind.expandNode(el, expand);
            } catch (error) {
                logMindMapBatchActionFailure('expandNode', error);
            }
        });
    }, [mind, batch]);

    const handleBatchDelete = useCallback(() => {
        if (!mind) return;
        try {
            mind.removeNodes(getSelectedElements(mind, batch.nodeObjs));
        } catch (error) {
            logMindMapBatchActionFailure('removeNodes', error);
        }
        setBatch(EMPTY);
    }, [mind, batch]);

    if (batch.count < 2) return null;

    const DivV = () => <span aria-hidden="true" className="mindmap-batch-bar__divider" />;

    return (
        <div
            className="mindmap-batch-bar"
            role="toolbar"
            aria-label={t('plugins.mindmap.batch.toolbarLabel')}
        >
            {/* Count badge */}
            <div className="mindmap-batch-bar__count" role="status" aria-live="polite">
                {t('plugins.mindmap.batch.selectedCount', { count: batch.count })}
            </div>

            <DivV />

            {/* Batch color */}
            <Popover
                open={colorOpen}
                onOpenChange={setColorOpen}
                trigger="click"
                placement="top"
                arrow={false}
                content={
                    <div
                        id={colorPanelId}
                        className="mindmap-batch-colors"
                        role="group"
                        aria-label={t('plugins.mindmap.batch.colorChoices')}
                    >
                        {BATCH_COLORS.map(c => (
                            <button
                                type="button"
                                key={c}
                                className="mindmap-batch-color"
                                aria-label={t('plugins.mindmap.batch.colorChoice', { color: c })}
                                onClick={() => handleBatchColor(c)}
                            >
                                <span aria-hidden="true" style={{ backgroundColor: c }} />
                            </button>
                        ))}
                    </div>
                }
            >
                <Tooltip title={t('plugins.mindmap.batch.colorTooltip')}>
                    <button
                        type="button"
                        className="mindmap-batch-bar__action"
                        aria-controls={colorPanelId}
                        aria-expanded={colorOpen}
                        aria-haspopup="dialog"
                        onClick={() => setColorOpen(v => !v)}
                    >
                        <Palette aria-hidden="true" size={15} />
                        {t('plugins.mindmap.batch.color')}
                    </button>
                </Tooltip>
            </Popover>

            {/* Expand */}
            <Tooltip title={t('plugins.mindmap.batch.expandTooltip')}>
                <button type="button" className="mindmap-batch-bar__action" onClick={() => handleBatchExpand(true)}>
                    <ChevronRight aria-hidden="true" size={15} />
                    {t('plugins.mindmap.batch.expand')}
                </button>
            </Tooltip>

            {/* Collapse */}
            <Tooltip title={t('plugins.mindmap.batch.collapseTooltip')}>
                <button type="button" className="mindmap-batch-bar__action" onClick={() => handleBatchExpand(false)}>
                    <ChevronDown aria-hidden="true" size={15} />
                    {t('plugins.mindmap.batch.collapse')}
                </button>
            </Tooltip>

            <DivV />

            {/* Delete */}
            <Popconfirm
                title={t('plugins.mindmap.batch.deleteTitle', { count: batch.count })}
                description={t('plugins.mindmap.batch.deleteDescription')}
                onConfirm={handleBatchDelete}
                okText={t('common.delete')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
                placement="top"
            >
                <Tooltip title={t('plugins.mindmap.batch.deleteTooltip')}>
                    <button type="button" className="mindmap-batch-bar__action mindmap-batch-bar__action--danger">
                        <Trash2 aria-hidden="true" size={15} />
                        {t('common.delete')}
                    </button>
                </Tooltip>
            </Popconfirm>
        </div>
    );
};

export default MindMapBatchBar;
