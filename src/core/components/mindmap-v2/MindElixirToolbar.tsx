/**
 * MindElixirToolbar.tsx — Vizly toolbar integration for mind-elixir v2
 *
 * Replaces the old RF-based MindMapToolbar.
 * All operations call mindRef.current methods directly — no custom events needed.
 */

import React, { useCallback } from 'react';
import { Select, Divider, Tooltip, Button } from 'antd';
import {
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    FullscreenOutlined,
    UndoOutlined,
    RedoOutlined,
    ExportOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MindElixir from 'mind-elixir';
import type { NodeObj } from 'mind-elixir';
import { useMindElixir } from './MindElixirWrapper';
import { directionStringToInt } from './migrate';

const DIRECTION_OPTIONS = [
    { label: '↔ 双向展开', value: 'LR' },
    { label: '→ 向右', value: 'R' },
    { label: '← 向左', value: 'L' },
    { label: '↓ 向下', value: 'TB' },
];

/** Recursively set expanded flag on all nodes */
function setExpandedAll(node: NodeObj, expanded: boolean): NodeObj {
    return {
        ...node,
        expanded,
        children: (node.children ?? []).map(c => setExpandedAll(c, expanded)),
    };
}

const MindElixirToolbar: React.FC = () => {
    const { instance: mind } = useMindElixir();
    const { t } = useTranslation();

    // Read current direction from instance
    const currentDir = mind ? (mind.direction === MindElixir.SIDE ? 'LR'
        : mind.direction === MindElixir.RIGHT ? 'R'
        : mind.direction === MindElixir.LEFT ? 'L'
        : 'TB') : 'LR';

    const handleDirectionChange = useCallback((dir: string) => {
        if (!mind) return;
        const data = mind.getData();
        mind.refresh({ ...data, direction: directionStringToInt(dir) as any });
    }, [mind]);

    const handleCollapseAll = useCallback(() => {
        if (!mind) return;
        const data = mind.getData();
        const newNodeData = setExpandedAll(data.nodeData, false);
        // Keep root expanded
        newNodeData.expanded = true;
        mind.refresh({ ...data, nodeData: newNodeData });
    }, [mind]);

    const handleExpandAll = useCallback(() => {
        if (!mind) return;
        const data = mind.getData();
        mind.refresh({ ...data, nodeData: setExpandedAll(data.nodeData, true) });
    }, [mind]);

    const handleFitView = useCallback(() => {
        mind?.toCenter();
    }, [mind]);

    const handleUndo = useCallback(() => {
        mind?.undo();
    }, [mind]);

    const handleRedo = useCallback(() => {
        mind?.redo();
    }, [mind]);

    const handleExportSvg = useCallback(async () => {
        if (!mind) return;
        try {
            const svgEl = await mind.exportSvg();
            const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mindmap.svg';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('SVG export failed:', e);
        }
    }, [mind]);

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8,
        }}>
            <Select
                size="small"
                variant="borderless"
                value={currentDir}
                onChange={handleDirectionChange}
                style={{ width: 130 }}
                options={DIRECTION_OPTIONS}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title="撤销 (Ctrl+Z)">
                <Button size="small" type="text" icon={<UndoOutlined />} onClick={handleUndo} />
            </Tooltip>
            <Tooltip title="重做 (Ctrl+Y)">
                <Button size="small" type="text" icon={<RedoOutlined />} onClick={handleRedo} />
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title={t('plugins.mindmap.collapseAll')}>
                <Button size="small" type="text" icon={<MenuFoldOutlined />} onClick={handleCollapseAll} />
            </Tooltip>
            <Tooltip title={t('plugins.mindmap.expandAll')}>
                <Button size="small" type="text" icon={<MenuUnfoldOutlined />} onClick={handleExpandAll} />
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title={t('plugins.mindmap.fitView')}>
                <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={handleFitView} />
            </Tooltip>
            <Tooltip title="导出 SVG">
                <Button size="small" type="text" icon={<ExportOutlined />} onClick={handleExportSvg} />
            </Tooltip>
        </div>
    );
};

export default MindElixirToolbar;
