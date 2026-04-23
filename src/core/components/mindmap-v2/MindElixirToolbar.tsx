/**
 * MindElixirToolbar.tsx — Vizly toolbar integration for mind-elixir v2
 *
 * Replaces the old RF-based MindMapToolbar.
 * All operations call mindRef.current methods directly — no custom events needed.
 *
 * Features:
 *   - Direction selector (LR / R / L / TB)
 *   - Theme selector (5 built-in themes)
 *   - Undo / Redo (native mind-elixir history)
 *   - Collapse All / Expand All
 *   - Fit to Center
 *   - Export SVG / PNG
 *   - Add root child
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Select, Divider, Tooltip, Button, Dropdown } from 'antd';
import {
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    FullscreenOutlined,
    UndoOutlined,
    RedoOutlined,
    ExportOutlined,
    BgColorsOutlined,
    PlusOutlined,
    DownloadOutlined,
    AimOutlined,
    PlaySquareOutlined,
    UploadOutlined,
    ShareAltOutlined,
    BranchesOutlined,
    BarChartOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MindElixir from 'mind-elixir';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import {
    directionStringToInt, nodeObjToMarkdown, nodeObjToOpml, downloadText,
    markdownToNodeObj, opmlToNodeObj, countNodes, getTreeDepth,
} from './migrate';
import { VIZLY_THEME_OPTIONS, VIZLY_THEMES } from './theme';
import { usePresentationMode } from './MindMapPresentationMode';
import { emitOpenSearch } from './mindmapSearchStore';


const DIRECTION_OPTIONS = [
    { label: '↔ 双向展开', value: 'LR' },
    { label: '→ 向右展开', value: 'R' },
    { label: '← 向左展开', value: 'L' },
    { label: '↓ 向下展开', value: 'TB' },
];

/** Recursively set expanded flag on all nodes */
function setExpandedAll(node: NodeObj, expanded: boolean): NodeObj {
    return {
        ...node,
        expanded,
        children: (node.children ?? []).map(c => setExpandedAll(c, expanded)),
    };
}

const THEME_KEY_LS = 'vizly_mindmap_theme';

// ─── Toolbar Props ────────────────────────────────────────────────────────────
interface MindElixirToolbarProps {}

// ─── Focus mode state (module-level, shared) ─────────────────────────────────
let _isFocused = false;

const MindElixirToolbar: React.FC<MindElixirToolbarProps> = () => {
    // Subscribe to store so we re-render when instance becomes available
    const [, setTick] = useState(0);
    useEffect(() => subscribeMindElixir(() => setTick(t => t + 1)), []);
    const mind = getMindElixirInstance();
    const { t } = useTranslation();

    // Presentation mode — declare state first so callback closure is clean
    const [isPresenting, setIsPresenting] = useState(false);
    const presentation = usePresentationMode(mind, () => setIsPresenting(false));

    const handlePresentation = useCallback(() => {
        if (isPresenting) {
            presentation.stop();
            setIsPresenting(false);
        } else {
            presentation.start();
            setIsPresenting(true);
        }
    }, [isPresenting, presentation]);

    // Active theme
    const [activeThemeKey, setActiveThemeKey] = useState<string>(() => {
        return localStorage.getItem(THEME_KEY_LS) || 'indigo';
    });

    // Read current direction: prefer live instance value, fall back to localStorage
    const currentDir = mind
        ? (mind.direction === MindElixir.SIDE ? 'LR'
            : mind.direction === MindElixir.RIGHT ? 'R'
            : mind.direction === MindElixir.LEFT ? 'L'
            : 'TB')
        : (localStorage.getItem('vizly_mindmap_dir') || 'LR');

    const handleDirectionChange = useCallback((dir: string) => {
        if (!mind) return;
        const data = mind.getData();
        const dirInt = directionStringToInt(dir) as 0 | 1 | 2;
        mind.refresh({ ...data, direction: dirInt });
        localStorage.setItem('vizly_mindmap_dir', dir);  // persist direction
    }, [mind]);

    const handleThemeChange = useCallback((key: string) => {
        if (!mind) return;
        const theme = VIZLY_THEMES[key];
        if (!theme) return;
        mind.changeTheme(theme);
        setActiveThemeKey(key);
        localStorage.setItem(THEME_KEY_LS, key);
    }, [mind]);

    const handleCollapseAll = useCallback(() => {
        if (!mind) return;
        const data = mind.getData();
        const newNodeData = setExpandedAll(data.nodeData, false);
        newNodeData.expanded = true; // Keep root expanded
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

    const handleAddRootChild = useCallback(() => {
        if (!mind) return;
        // Select the root node first, then add a child to it
        try {
            const rootTpc = mind.findEle(mind.getData().nodeData.id);
            if (rootTpc) {
                mind.selectNode(rootTpc);
                mind.addChild(rootTpc);
            }
        } catch (e) {
            console.warn('[Toolbar] addRootChild failed:', e);
        }
    }, [mind]);

    const handleExportSvg = useCallback(async () => {
        if (!mind) return;
        try {
            // exportSvg() returns a Blob directly
            const blob = mind.exportSvg();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mindmap.svg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('SVG export failed:', e);
        }
    }, [mind]);

    const handleExportPng = useCallback(async () => {
        if (!mind) return;
        try {
            const blob = await mind.exportPng();
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mindmap.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('PNG export failed:', e);
        }
    }, [mind]);

    const handleExportMarkdown = useCallback(() => {
        if (!mind) return;
        try {
            const md = nodeObjToMarkdown(mind.getData().nodeData);
            downloadText('mindmap.md', md, 'text/markdown');
        } catch (e) { console.error('Markdown export failed:', e); }
    }, [mind]);

    const handleExportOpml = useCallback(() => {
        if (!mind) return;
        try {
            const opml = nodeObjToOpml(mind.getData().nodeData);
            downloadText('mindmap.opml', opml, 'application/xml');
        } catch (e) { console.error('OPML export failed:', e); }
    }, [mind]);

    const handleExportJson = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const json = JSON.stringify(data, null, 2);
            downloadText('mindmap.json', json, 'application/json');
        } catch (e) { console.error('JSON export failed:', e); }
    }, [mind]);

    const handleFocusMode = useCallback(() => {
        if (!mind) return;
        try {
            if (_isFocused) {
                (mind as any).cancelFocus?.();
                _isFocused = false;
            } else {
                // Focus on currently selected node or root
                const tpcEl = mind.currentNode ?? mind.findEle(mind.getData().nodeData.id);
                if (tpcEl) {
                    (mind as any).focusNode?.(tpcEl);
                    _isFocused = true;
                }
            }
        } catch (e) { console.warn('[Toolbar] focusMode:', e); }
    }, [mind]);

    const exportMenuItems = [
        { key: 'svg',      label: '导出 SVG',      icon: <ExportOutlined />,  onClick: handleExportSvg },
        { key: 'png',      label: '导出 PNG',      icon: <DownloadOutlined />, onClick: handleExportPng },
        { key: 'markdown', label: '导出 Markdown', icon: <DownloadOutlined />, onClick: handleExportMarkdown },
        { key: 'opml',     label: '导出 OPML',     icon: <DownloadOutlined />, onClick: handleExportOpml },
        { key: 'json',     label: '导出 JSON',     icon: <DownloadOutlined />, onClick: handleExportJson },
    ];

    // ── Summary creation ─────────────────────────────────────────────────────────
    const handleCreateSummary = useCallback(() => {
        if (!mind) return;
        try {
            mind.createSummary();
        } catch (e) { console.warn('[Summary]', e); }
    }, [mind]);

    const arrowFromRef = useRef<import('mind-elixir').Topic | null>(null);
    const [arrowMode, setArrowMode] = useState(false);

    const handleArrowMode = useCallback(() => {
        if (!mind) return;
        const entering = !arrowMode;
        setArrowMode(entering);
        arrowFromRef.current = null;
        if (entering) {
            // Intercept next two node clicks
            const handler = (_nodes: any[], el: import('mind-elixir').Topic) => {
                if (!arrowFromRef.current) {
                    arrowFromRef.current = el;
                } else {
                    try {
                        mind.createArrow(arrowFromRef.current, el);
                    } catch (e) { console.warn('[Arrow]', e); }
                    arrowFromRef.current = null;
                    setArrowMode(false);
                    mind.bus.removeListener('selectNodes', handler as any);
                }
            };
            mind.bus.addListener('selectNodes', handler as any);
        }
    }, [mind, arrowMode]);

    // ── Import Markdown ───────────────────────────────────────────────────────
    const fileInputRef = useRef<HTMLInputElement>(null);
    const opmlInputRef = useRef<HTMLInputElement>(null);

    const handleImportMarkdown = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleImportOpml = useCallback(() => {
        opmlInputRef.current?.click();
    }, []);

    const loadAndRefresh = useCallback((nodeData: import('mind-elixir').NodeObj) => {
        if (!mind) return;
        mind.refresh({ nodeData });
        mind.toCenter();
        (mind as any).clearHistory?.();
    }, [mind]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !mind) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const md = ev.target?.result as string;
                loadAndRefresh(markdownToNodeObj(md));
            } catch (err) { console.error('[Import MD]', err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [mind, loadAndRefresh]);

    const handleOpmlFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !mind) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const xml = ev.target?.result as string;
                loadAndRefresh(opmlToNodeObj(xml));
            } catch (err) { console.error('[Import OPML]', err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [mind, loadAndRefresh]);

    // ── Stats ─────────────────────────────────────────────────────────────────
    const [stats, setStats] = useState({ nodes: 0, depth: 0 });
    useEffect(() => {
        if (!mind) return;
        const update = () => {
            try {
                const data = mind.getData();
                setStats({
                    nodes: countNodes(data.nodeData),
                    depth: getTreeDepth(data.nodeData),
                });
            } catch {}
        };
        update();
        mind.bus.addListener('operation', update);
        return () => { mind.bus.removeListener('operation', update); };
    }, [mind]);

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 8px', borderLeft: '1px solid rgba(0,0,0,0.08)', marginLeft: 8,
        }}>
            {/* Direction selector */}
            <Select
                size="small"
                variant="borderless"
                value={currentDir}
                onChange={handleDirectionChange}
                style={{ width: 124 }}
                options={DIRECTION_OPTIONS}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Theme selector */}
            <Dropdown
                menu={{
                    items: VIZLY_THEME_OPTIONS.map(opt => ({
                        key: opt.key,
                        label: (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: 5,
                                    background: opt.theme.cssVar['--main-bgcolor'],
                                    flexShrink: 0,
                                }} />
                                <span>{opt.label}</span>
                                {opt.key === activeThemeKey && (
                                    <span style={{ marginLeft: 'auto', color: '#6366f1', fontSize: 11 }}>✓</span>
                                )}
                            </div>
                        ),
                        onClick: () => handleThemeChange(opt.key),
                    })),
                }}
                placement="bottomLeft"
                trigger={['click']}
            >
                <Tooltip title="切换主题">
                    <Button
                        size="small"
                        type="text"
                        icon={<BgColorsOutlined />}
                        style={{ color: VIZLY_THEMES[activeThemeKey]?.palette[0] ?? '#6366f1' }}
                    />
                </Tooltip>
            </Dropdown>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Undo / Redo */}
            <Tooltip title="撤销 (Ctrl+Z)">
                <Button size="small" type="text" icon={<UndoOutlined />} onClick={handleUndo} disabled={!mind} />
            </Tooltip>
            <Tooltip title="重做 (Ctrl+Y)">
                <Button size="small" type="text" icon={<RedoOutlined />} onClick={handleRedo} disabled={!mind} />
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Add root child */}
            <Tooltip title="添加主分支 (Tab)">
                <Button size="small" type="text" icon={<PlusOutlined />} onClick={handleAddRootChild} disabled={!mind} />
            </Tooltip>

            {/* Collapse / Expand */}
            <Tooltip title={t('plugins.mindmap.collapseAll', '折叠全部')}>
                <Button size="small" type="text" icon={<MenuFoldOutlined />} onClick={handleCollapseAll} disabled={!mind} />
            </Tooltip>
            <Tooltip title={t('plugins.mindmap.expandAll', '展开全部')}>
                <Button size="small" type="text" icon={<MenuUnfoldOutlined />} onClick={handleExpandAll} disabled={!mind} />
            </Tooltip>

            {/* Presentation Mode */}
            <Tooltip title="演示模式（逐节点呈现）">
                <Button size="small" type="text" icon={<PlaySquareOutlined />}
                    onClick={handlePresentation} disabled={!mind}
                    style={{ color: isPresenting ? '#6366f1' : undefined }} />
            </Tooltip>

            {/* Focus Mode */}
            <Tooltip title="焦点模式（聚焦选中节点）">
                <Button size="small" type="text" icon={<AimOutlined />}
                    onClick={handleFocusMode} disabled={!mind}
                    style={{ color: _isFocused ? '#6366f1' : undefined }} />
            </Tooltip>

            {/* Summary node creation */}
            <Tooltip title="为选中节点创建汇总括号">
                <Button size="small" type="text" icon={<BranchesOutlined />}
                    onClick={handleCreateSummary} disabled={!mind} />
            </Tooltip>

            {/* Arrow creation mode */}
            <Tooltip title={arrowMode ? '点击两个节点创建关联线（已开启）' : '创建关联线'}>
                <Button size="small" type="text" icon={<ShareAltOutlined />}
                    onClick={handleArrowMode} disabled={!mind}
                    style={{ color: arrowMode ? '#6366f1' : undefined }} />
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Fit to center */}
            <Tooltip title={t('plugins.mindmap.fitView', '居中')}>
                <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={handleFitView} disabled={!mind} />
            </Tooltip>

            {/* Export dropdown */}
            <Dropdown
                menu={{ items: exportMenuItems }}
                placement="bottomRight"
                trigger={['click']}
            >
                <Tooltip title="导出">
                    <Button size="small" type="text" icon={<ExportOutlined />} disabled={!mind} />
                </Tooltip>
            </Dropdown>

            {/* Hidden file inputs */}
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt"
                style={{ display: 'none' }} onChange={handleFileChange} />
            <input ref={opmlInputRef} type="file" accept=".opml,.xml"
                style={{ display: 'none' }} onChange={handleOpmlFileChange} />

            {/* Import dropdown (MD + OPML) */}
            <Dropdown
                menu={{
                    items: [
                        { key: 'md',   label: '从 Markdown 导入', icon: <UploadOutlined />, onClick: handleImportMarkdown },
                        { key: 'opml', label: '从 OPML 导入',     icon: <UploadOutlined />, onClick: handleImportOpml },
                    ]
                }}
                placement="bottomRight"
                trigger={['click']}
            >
                <Tooltip title="导入">
                    <Button size="small" type="text" icon={<UploadOutlined />} disabled={!mind} />
                </Tooltip>
            </Dropdown>

            {/* Node stats badge */}
            {mind && stats.nodes > 0 && (
                <Tooltip title={`共 ${stats.nodes} 个节点，最大深度 ${stats.depth} 层`}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 12,
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.15)',
                        cursor: 'default', userSelect: 'none',
                    }}>
                        <BarChartOutlined style={{ fontSize: 11, color: '#6366f1' }} />
                        <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>
                            {stats.nodes}节点
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(99,102,241,0.6)' }}>
                            /{stats.depth}层
                        </span>
                    </div>
                </Tooltip>
            )}

            {/* Search */}
            <Tooltip title="搜索节点 (Ctrl+F)">
                <Button size="small" type="text" icon={<SearchOutlined />}
                    onClick={emitOpenSearch} disabled={!mind} />
            </Tooltip>
        </div>
    );
};

export default MindElixirToolbar;
