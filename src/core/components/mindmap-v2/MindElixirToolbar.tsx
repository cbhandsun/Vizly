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
    ZoomInOutlined,
    ZoomOutOutlined,
    PrinterOutlined,
    QuestionCircleOutlined,
    ProjectOutlined,
    RobotOutlined,
    DeploymentUnitOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MindElixir from 'mind-elixir';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir, setPresentationState, toggleKanban, subscribeKanban, toggleAIPanel, subscribeAIPanel } from './mindElixirStore';
import {
    directionStringToInt, nodeObjToMarkdown, nodeObjToOpml, downloadText,
    markdownToNodeObj, opmlToNodeObj, countNodes, getTreeDepth, nodeObjToFlowchartJson
} from './migrate';
import { VIZLY_THEME_OPTIONS, VIZLY_THEMES } from './theme';
import { usePresentationMode } from './MindMapPresentationMode';
import { emitOpenSearch } from './mindmapSearchStore';
import { emitToggleOutline } from './mindmapOutlineStore';
import { emitToggleHistory } from './mindmapHistoryStore';
import MindMapShortcutsModal from './MindMapShortcutsModal';
import MindMapTemplates from './MindMapTemplates';
import { exportXmind } from './exportXmind';
import { analyzeNodesRelationship } from './mindmapAIService';
import { nodeObjToPitchMarkdown } from './mindmapPitchExport';
import { arrangeMindMapTree } from './mindmapAutoArrange';
import { getFileSizeLimitError, MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../utils/fileImportGuards';
import { parseDiagramJson } from '../../utils/diagramJsonImport';
import { downloadBlob } from '../../utils/downloadUtils';
import { cleanAndValidateTree, cleanMindMapData } from './mindmapTreeSanitizer';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import {
    logMindmapToolbarAddRootChildFailure,
    logMindmapToolbarArrowFailure,
    logMindmapToolbarAutoArrangeFailure,
    logMindmapToolbarExportFailure,
    logMindmapToolbarFocusModeFailure,
    logMindmapToolbarImportFailure,
    logMindmapToolbarImportRejected,
    logMindmapToolbarStatsUpdateFailure,
    logMindmapToolbarSummaryFailure,
} from './mindmapToolbarLogging';


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

// ─── Focus mode state (module-level, shared) ─────────────────────────────────
let _isFocused = false;

const MindElixirToolbar: React.FC = () => {
    // Subscribe to store so we re-render when instance becomes available
    const [, setTick] = useState(0);
    useEffect(() => subscribeMindElixir(() => setTick(t => t + 1)), []);
    const mind = getMindElixirInstance();
    const { t } = useTranslation();

    const [isKanbanOpen, setIsKanbanOpen] = useState(false);
    useEffect(() => subscribeKanban(o => setIsKanbanOpen(o)), []);

    const handleToggleKanban = useCallback(() => {
        toggleKanban();
    }, []);

    const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
    useEffect(() => subscribeAIPanel(o => setIsAIPanelOpen(o)), []);

    const handleToggleAIPanel = useCallback(() => {
        toggleAIPanel();
    }, []);

    // ── Canvas background pattern ──────────────────────────────────────────────
    const [bgPattern, setBgPattern] = useState<'none' | 'grid' | 'dots'>(() =>
        (localStorage.getItem('vizly_mindmap_bg') as any) ?? 'none'
    );
    const applyBgPattern = useCallback((pattern: 'none' | 'grid' | 'dots') => {
        setBgPattern(pattern);
        localStorage.setItem('vizly_mindmap_bg', pattern);
        const el = document.getElementById('vizly-mind-elixir-root');
        if (!el) return;
        el.setAttribute('data-bg', pattern);
    }, []);
    // Apply on mount and when mind loads
    useEffect(() => {
        const el = document.getElementById('vizly-mind-elixir-root');
        if (el) el.setAttribute('data-bg', bgPattern);
    }, [mind, bgPattern]);

    // Presentation mode — declare state first so callback closure is clean
    const [isPresenting, setIsPresenting] = useState(false);
    const presentation = usePresentationMode(
        mind,
        () => {
            setIsPresenting(false);
            setPresentationState(false, null);
        },
        (node) => {
            setPresentationState(true, node);
        }
    );

    const handlePresentation = useCallback(() => {
        if (isPresenting) {
            presentation.stop();
            setIsPresenting(false);
            setPresentationState(false, null);
        } else {
            presentation.start();
            setIsPresenting(true);
            // usePresentationMode start will navigate to the first node and call nodeFocus.
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
        mind.refresh({ ...data, nodeData: cleanAndValidateTree(data.nodeData, true), direction: dirInt });
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
        const newNodeData = setExpandedAll(cleanAndValidateTree(data.nodeData, true), false);
        newNodeData.expanded = true; // Keep root expanded
        mind.refresh({ ...data, nodeData: newNodeData });
    }, [mind]);

    const handleExpandAll = useCallback(() => {
        if (!mind) return;
        const data = mind.getData();
        mind.refresh({ ...data, nodeData: setExpandedAll(cleanAndValidateTree(data.nodeData, true), true) });
    }, [mind]);

    const handleFitView = useCallback(() => {
        mind?.toCenter();
    }, [mind]);

    const handleAutoArrange = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const nodeData = cleanAndValidateTree(arrangeMindMapTree(data.nodeData), true);
            mind.refresh({ ...data, nodeData });
            mind.layout();
            setTimeout(() => mind.toCenter(), 80);
            mind.bus.fire('operation', {
                name: 'autoArrangeMindmap',
                obj: nodeData,
            });
        } catch (e) {
            logMindmapToolbarAutoArrangeFailure(e);
        }
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
                mind.addChild(rootTpc, cleanMindMapChildNode());
            }
        } catch (e) {
            logMindmapToolbarAddRootChildFailure(e);
        }
    }, [mind]);

    const handleExportSvg = useCallback(async () => {
        if (!mind) return;
        try {
            // exportSvg() returns a Blob directly
            const blob = mind.exportSvg();
            downloadBlob(blob, 'mindmap.svg', 'mindmap.svg');
        } catch (e) {
            logMindmapToolbarExportFailure('SVG', e);
        }
    }, [mind]);

    const handleExportPng = useCallback(async () => {
        if (!mind) return;
        try {
            const blob = await mind.exportPng();
            if (!blob) return;
            downloadBlob(blob, 'mindmap.png', 'mindmap.png');
        } catch (e) {
            logMindmapToolbarExportFailure('PNG', e);
        }
    }, [mind]);

    const handleExportMarkdown = useCallback(() => {
        if (!mind) return;
        try {
            const md = nodeObjToMarkdown(mind.getData().nodeData);
            downloadText('mindmap.md', md, 'text/markdown');
        } catch (e) { logMindmapToolbarExportFailure('Markdown', e); }
    }, [mind]);

    const handleExportOpml = useCallback(() => {
        if (!mind) return;
        try {
            const opml = nodeObjToOpml(mind.getData().nodeData);
            downloadText('mindmap.opml', opml, 'application/xml');
        } catch (e) { logMindmapToolbarExportFailure('OPML', e); }
    }, [mind]);

    const handleExportJson = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const json = JSON.stringify(data, null, 2);
            downloadText('mindmap.json', json, 'application/json');
        } catch (e) { logMindmapToolbarExportFailure('JSON', e); }
    }, [mind]);

    const handleExportFlowchart = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const json = nodeObjToFlowchartJson(data.nodeData);
            downloadText('mindmap_to_flowchart.vizly', json, 'application/json');
        } catch (e) { logMindmapToolbarExportFailure('Flowchart', e); }
    }, [mind]);

    const handleExportPitchMarkdown = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const md = nodeObjToPitchMarkdown(data.nodeData);
            downloadText('mindmap_pitch.md', md, 'text/markdown;charset=utf-8');
        } catch (e) { logMindmapToolbarExportFailure('Pitch markdown', e); }
    }, [mind]);

    const handleExportXmind = useCallback(async () => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const title = data.nodeData?.topic ?? 'mindmap';
            await exportXmind(data.nodeData, title);
        } catch (e) { logMindmapToolbarExportFailure('XMind', e); }
    }, [mind]);

    const handleExportPdf = useCallback(() => {
        if (!mind) return;
        // Use browser print API: hide everything except the mind-elixir container
        const style = document.createElement('style');
        style.id = 'me-print-style';
        style.textContent = `
            @media print {
                body > * { display: none !important; }
                #vizly-mind-elixir-root, #vizly-mind-elixir-root * { display: block !important; }
                #vizly-mind-elixir-root {
                    position: fixed !important;
                    top: 0 !important; left: 0 !important;
                    width: 100vw !important; height: 100vh !important;
                    overflow: visible !important;
                }
            }
        `;
        document.head.appendChild(style);
        window.print();
        setTimeout(() => style.remove(), 1000);
    }, [mind]);

    // ── Zoom controls ───────────────────────────────────────────────────────
    const [zoomVal, setZoomVal] = useState(100);
    useEffect(() => {
        if (!mind) return;
        const update = () => setZoomVal(Math.round((mind.scaleVal ?? 1) * 100));
        update();
        mind.bus.addListener('operation', update);
        return () => { mind.bus.removeListener('operation', update); };
    }, [mind]);

    const handleZoomIn = useCallback(() => {
        if (!mind) return;
        mind.scale(Math.min((mind.scaleVal ?? 1) + 0.1, 3));
    }, [mind]);

    const handleZoomOut = useCallback(() => {
        if (!mind) return;
        mind.scale(Math.max((mind.scaleVal ?? 1) - 0.1, 0.2));
    }, [mind]);

    const handleZoomReset = useCallback(() => {
        if (!mind) return;
        mind.scale(1);
        mind.toCenter();
    }, [mind]);

    // Also update zoom on wheel scroll (mind-elixir zoom doesn't emit 'operation')
    useEffect(() => {
        if (!mind) return;
        let timer: ReturnType<typeof setTimeout>;
        const onWheel = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                setZoomVal(Math.round((mind.scaleVal ?? 1) * 100));
            }, 80);
        };
        const container = mind.container;
        container?.addEventListener('wheel', onWheel, { passive: true });
        return () => {
            clearTimeout(timer);
            container?.removeEventListener('wheel', onWheel);
        };
    }, [mind]);

    // ── Shortcuts panel ─────────────────────────────────────────────────────────
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
        } catch (e) { logMindmapToolbarFocusModeFailure(e); }
    }, [mind]);

    // ── 自动节点编号 ─────────────────────────────────────────────────────────────
    const [isNumbering, setIsNumbering] = useState(false);
    const handleToggleNumbering = useCallback(() => {
        const el = document.getElementById('vizly-mind-elixir-root');
        if (!el) return;
        setIsNumbering(v => {
            const next = !v;
            if (next) el.setAttribute('data-numbering', '');
            else el.removeAttribute('data-numbering');
            return next;
        });
    }, []);

    const exportMenuItems = [
        { key: 'svg',      label: '导出 SVG',      icon: <ExportOutlined />,  onClick: handleExportSvg },
        { key: 'png',      label: '导出 PNG',      icon: <DownloadOutlined />, onClick: handleExportPng },
        { key: 'xmind',   label: '导出 XMind',    icon: <DownloadOutlined />, onClick: handleExportXmind },
        { type: 'divider' as const },
        { key: 'markdown', label: '导出 Markdown', icon: <DownloadOutlined />, onClick: handleExportMarkdown },
        { key: 'opml',     label: '导出 OPML',     icon: <DownloadOutlined />, onClick: handleExportOpml },
        { key: 'json',     label: '导出 JSON',     icon: <DownloadOutlined />, onClick: handleExportJson },
        { type: 'divider' as const },
        { key: 'pitch-md', label: '导出演示稿 Markdown', icon: <PlaySquareOutlined />, onClick: handleExportPitchMarkdown },
        { type: 'divider' as const },
        { key: 'flowchart',label: '转为流程图格式', icon: <ShareAltOutlined />, onClick: handleExportFlowchart },
        { type: 'divider' as const },
        { key: 'pdf',      label: '打印 / PDF',    icon: <PrinterOutlined />,  onClick: handleExportPdf },
    ];

    // ── Summary creation ─────────────────────────────────────────────────────────
    const handleCreateSummary = useCallback(() => {
        if (!mind) return;
        try {
            mind.createSummary();
        } catch (e) { logMindmapToolbarSummaryFailure(e); }
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
                    const fromEl = arrowFromRef.current;
                    try {
                        mind.createArrow(fromEl, el);
                        // AI 语义智能分析与命名
                        const arrows = mind.arrows || [];
                        const newArrow = arrows[arrows.length - 1];
                        if (newArrow) {
                            newArrow.label = '...'; // 加载状态
                            mind.renderArrow();

                            const fromId = fromEl.dataset?.nodeid;
                            const toId = el.dataset?.nodeid;
                            if (fromId && toId) {
                                const data = mind.getData();
                                const fromNode = mind.getObjById(fromId, data.nodeData);
                                const toNode = mind.getObjById(toId, data.nodeData);
                                if (fromNode && toNode) {
                                    analyzeNodesRelationship(fromNode.topic, toNode.topic).then((res) => {
                                        if ('error' in res) {
                                            newArrow.label = '关联'; // 兜底
                                        } else {
                                            newArrow.label = res.relationText;
                                        }
                                        mind.renderArrow();
                                        // 触发 operation 记录，同步协同和静默保存
                                        mind.bus.fire('operation', {
                                            name: 'editArrowLabel',
                                            obj: newArrow,
                                        });
                                    });
                                }
                            }
                        }
                    } catch (e) { logMindmapToolbarArrowFailure(e); }
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
        mind.refresh({ nodeData: cleanAndValidateTree(nodeData, true) });
        mind.toCenter();
        (mind as any).clearHistory?.();
    }, [mind]);

    // ── JSON import ─────────────────────────────────────────────────────────────
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const handleImportJson = useCallback(() => { jsonInputRef.current?.click(); }, []);
    const handleJsonFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !mind) return;
        const sizeError = getFileSizeLimitError(file, MINDMAP_TEXT_IMPORT_MAX_BYTES, 'mind map JSON');
        if (sizeError) {
            logMindmapToolbarImportRejected('JSON', sizeError);
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = parseDiagramJson(String(ev.target?.result || ''));
                const data = cleanMindMapData(json);
                if (!mind) return;
                mind.refresh(data);
                mind.toCenter();
                (mind as any).clearHistory?.();
            } catch (err) { logMindmapToolbarImportFailure('JSON', err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [mind]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !mind) return;
        const sizeError = getFileSizeLimitError(file, MINDMAP_TEXT_IMPORT_MAX_BYTES, 'Markdown');
        if (sizeError) {
            logMindmapToolbarImportRejected('Markdown', sizeError);
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const md = ev.target?.result as string;
                loadAndRefresh(cleanAndValidateTree(markdownToNodeObj(md), true));
            } catch (err) { logMindmapToolbarImportFailure('Markdown', err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [mind, loadAndRefresh]);

    const handleOpmlFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !mind) return;
        const sizeError = getFileSizeLimitError(file, MINDMAP_TEXT_IMPORT_MAX_BYTES, 'OPML');
        if (sizeError) {
            logMindmapToolbarImportRejected('OPML', sizeError);
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const xml = ev.target?.result as string;
                loadAndRefresh(cleanAndValidateTree(opmlToNodeObj(xml), true));
            } catch (err) { logMindmapToolbarImportFailure('OPML', err); }
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
            } catch (error) {
                logMindmapToolbarStatsUpdateFailure(error);
            }
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

            {/* Auto numbering */}
            <Tooltip title={isNumbering ? '关闭自动编号' : '开启自动编号（每层节点自动加序号）'}>
                <Button size="small" type="text"
                    onClick={handleToggleNumbering} disabled={!mind}
                    style={{ color: isNumbering ? '#6366f1' : undefined, fontSize: 12, fontWeight: 700 }}
                >
                    #
                </Button>
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Fit to center */}
            <Tooltip title={t('plugins.mindmap.fitView', '居中')}>
                <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={handleFitView} disabled={!mind} />
            </Tooltip>

            <Tooltip title="自动整理分支">
                <Button size="small" type="text" icon={<DeploymentUnitOutlined />} onClick={handleAutoArrange} disabled={!mind} />
            </Tooltip>

            {/* Zoom controls */}
            {mind && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, overflow: 'hidden',
                }}>
                    <Button size="small" type="text" icon={<ZoomOutOutlined />}
                        onClick={handleZoomOut}
                        style={{ borderRadius: 0, width: 24, padding: 0, minWidth: 0 }}
                        title="缩小" />
                    <Tooltip title="点击重置为 100%">
                        <span onClick={handleZoomReset}
                            style={{
                                fontSize: 11, fontWeight: 600, minWidth: 36,
                                textAlign: 'center', cursor: 'pointer',
                                color: zoomVal !== 100 ? '#6366f1' : 'inherit',
                                padding: '0 2px', lineHeight: '22px',
                                transition: 'color 0.15s',
                            }}>
                            {zoomVal}%
                        </span>
                    </Tooltip>
                    <Button size="small" type="text" icon={<ZoomInOutlined />}
                        onClick={handleZoomIn}
                        style={{ borderRadius: 0, width: 24, padding: 0, minWidth: 0 }}
                        title="放大" />
                </div>
            )}

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
            <input ref={jsonInputRef} type="file" accept=".json"
                style={{ display: 'none' }} onChange={handleJsonFileChange} />

            {/* Import dropdown (MD + OPML + JSON) */}
            <Dropdown
                menu={{
                    items: [
                        { key: 'md',   label: '从 Markdown 导入', icon: <UploadOutlined />, onClick: handleImportMarkdown },
                        { key: 'opml', label: '从 OPML 导入',     icon: <UploadOutlined />, onClick: handleImportOpml },
                        { key: 'json', label: '从 JSON 导入',     icon: <UploadOutlined />, onClick: handleImportJson },
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

            {/* Templates */}
            <MindMapTemplates />

            {/* Unified AI assistant */}
            <Tooltip title="AI 思维导图助手">
                <Button size="small" type="text"
                    icon={<RobotOutlined />}
                    onClick={handleToggleAIPanel}
                    disabled={!mind}
                    style={{ color: isAIPanelOpen ? '#8b5cf6' : undefined }}
                />
            </Tooltip>

            {/* Canvas background preset */}
            <Dropdown
                menu={{
                    items: [
                        {
                            key: 'none', label: '纯色背景',
                            icon: <span style={{ display:'inline-block', width:12, height:12,
                                borderRadius:2, background:'#1e293b', border:'1px solid #475569' }} />,
                            onClick: () => applyBgPattern('none'),
                        },
                        {
                            key: 'grid', label: '网格背景',
                            icon: <span style={{ display:'inline-block', width:12, height:12,
                                borderRadius:2, border:'1px solid #6366f1',
                                backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(99,102,241,.25) 3px,rgba(99,102,241,.25) 4px),repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(99,102,241,.25) 3px,rgba(99,102,241,.25) 4px)' }} />,
                            onClick: () => applyBgPattern('grid'),
                        },
                        {
                            key: 'dots', label: '点阵背景',
                            icon: <span style={{ display:'inline-block', width:12, height:12,
                                borderRadius:2, border:'1px solid #6366f1',
                                backgroundImage:'radial-gradient(circle, rgba(99,102,241,.5) 1px, transparent 1px)',
                                backgroundSize:'5px 5px' }} />,
                            onClick: () => applyBgPattern('dots'),
                        },
                    ],
                    selectable: true,
                    selectedKeys: [bgPattern],
                }}
                placement="bottomRight"
                trigger={['click']}
            >
                <Tooltip title="画布背景">
                    <Button size="small" type="text"
                        icon={<span style={{ fontSize: 14 }}>⊞</span>}
                        style={{ color: bgPattern !== 'none' ? '#6366f1' : 'rgba(255,255,255,0.4)' }} />
                </Tooltip>
            </Dropdown>

            {/* Outline view toggle */}
            <Tooltip title="大纲视图 (Alt+O)">
                <Button size="small" type="text"
                    onClick={emitToggleOutline}
                    style={{ fontSize: 13 }}
                >
                    ☰
                </Button>
            </Tooltip>

            {/* History version toggle */}
            <Tooltip title="历史快照 (Alt+H)">
                <Button size="small" type="text"
                    onClick={emitToggleHistory}
                    style={{ fontSize: 13 }}
                >
                    🕒
                </Button>
            </Tooltip>

            {/* Kanban toggle */}
            <Tooltip title="AI 敏捷任务看板">
                <Button size="small" type="text"
                    icon={<ProjectOutlined />}
                    onClick={handleToggleKanban}
                    style={{ color: isKanbanOpen ? '#6366f1' : undefined }}
                />
            </Tooltip>

            {/* Shortcuts help */}
            <Tooltip title="键盘快捷键 (?)">
                <Button size="small" type="text" icon={<QuestionCircleOutlined />}
                    onClick={() => setShortcutsOpen(true)}
                    style={{ color: 'rgba(255,255,255,0.4)' }} />
            </Tooltip>

            {/* Shortcuts Modal */}
            <MindMapShortcutsModal
                open={shortcutsOpen}
                onClose={() => setShortcutsOpen(false)}
            />
        </div>
    );
};

export default MindElixirToolbar;
