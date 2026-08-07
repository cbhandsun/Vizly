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
import { Divider, Tooltip, Dropdown } from 'antd';
import {
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    FullscreenOutlined,
    UndoOutlined,
    RedoOutlined,
    ExportOutlined,
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
    AppstoreOutlined,
    HistoryOutlined,
    OrderedListOutlined,
    UnorderedListOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MindElixirInstance } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir, setPresentationState, toggleKanban, subscribeKanban, toggleAIPanel, subscribeAIPanel } from './mindElixirStore';
import { countNodes, getTreeDepth } from './migrate';
import { VIZLY_THEMES } from './theme';
import { usePresentationMode } from './MindMapPresentationMode';
import { emitOpenSearch } from './mindmapSearchStore';
import { emitToggleOutline } from './mindmapOutlineStore';
import { emitToggleHistory } from './mindmapHistoryStore';
import MindMapShortcutsModal from './MindMapShortcutsModal';
import MindMapTemplates from './MindMapTemplates';
import { arrangeMindMapTree } from './mindmapAutoArrange';
import { cleanAndValidateTree } from './mindmapTreeSanitizer';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import {
    logMindmapToolbarAddRootChildFailure,
    logMindmapToolbarAutoArrangeFailure,
    logMindmapToolbarFocusModeFailure,
    logMindmapToolbarStatsUpdateFailure,
    logMindmapToolbarSummaryFailure,
} from './mindmapToolbarLogging';
import { persistMindMapThemeKey, resolveMindMapThemeKey } from './mindmapThemeStorage';
import { emitVizlyMindMapOperation } from './mindmapOperationBridge';
import { setMindMapTreeExpanded } from './mindmapTreeExpansion';
import { createMindElixirArrowModeController } from './mindElixirArrowModeController';
import { useMindElixirImportActions } from './useMindElixirImportActions';
import { useMindElixirExportActions } from './useMindElixirExportActions';
import { useMindElixirCanvasPreferences } from './useMindElixirCanvasPreferences';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import { MindMapThemeSelector } from './MindMapThemeSelector';
import { MindMapDirectionSelector } from './MindMapDirectionSelector';
import { useMindMapFocusMode } from './useMindMapFocusMode';
import { getViewportPopupContainer } from '../ui/viewportOverlayPortal';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { createMindMapSummaryForSelection } from './mindMapSummaryCreation';
import './MindElixirToolbar.css';


type MindMapToolbarMenu = 'background' | 'direction' | 'export' | 'import' | 'theme';

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

    const {
        backgroundPattern: bgPattern,
        applyBackgroundPattern: applyBgPattern,
        currentDirection: currentDir,
        changeDirection: handleDirectionChange,
    } = useMindElixirCanvasPreferences(mind);

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
    const [activeThemeKey, setActiveThemeKey] = useState<string>(resolveMindMapThemeKey);

    const handleThemeChange = useCallback((key: string) => {
        if (!mind) return;
        const theme = VIZLY_THEMES[key];
        if (!theme) return;
        mind.changeTheme(theme);
        setActiveThemeKey(key);
        persistMindMapThemeKey(key);
    }, [mind]);

    const handleCollapseAll = useCallback(() => {
        if (!mind) return;
        const data = mind.getData();
        const newNodeData = setMindMapTreeExpanded(cleanAndValidateTree(data.nodeData, true), false);
        newNodeData.expanded = true; // Keep root expanded
        mind.refresh({ ...data, nodeData: newNodeData });
    }, [mind]);

    const handleExpandAll = useCallback(() => {
        if (!mind) return;
        const data = mind.getData();
        mind.refresh({ ...data, nodeData: setMindMapTreeExpanded(cleanAndValidateTree(data.nodeData, true), true) });
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
            emitVizlyMindMapOperation(mind, {
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

    const {
        handleExportSvg,
        handleExportPng,
        handleExportMarkdown,
        handleExportOpml,
        handleExportJson,
        handleExportFlowchart,
        handleExportPitchMarkdown,
        handleExportXmind,
        handleExportPdf,
    } = useMindElixirExportActions(mind);

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
    const [openMenu, setOpenMenu] = useState<MindMapToolbarMenu | null>(null);

    const { isFocused, toggleFocusMode } = useMindMapFocusMode(mind);
    const handleFocusMode = useCallback(() => {
        try {
            toggleFocusMode();
        } catch (error) {
            logMindmapToolbarFocusModeFailure(error);
        }
    }, [toggleFocusMode]);

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
        const result = createMindMapSummaryForSelection(mind);
        if (result.ok) {
            appMessage.success(result.message);
            return;
        }
        if (result.error) logMindmapToolbarSummaryFailure(result.error);
        if (result.code === 'create-failed') appMessage.error(result.message);
        else appMessage.warning(result.message);
    }, [mind]);

    const [arrowState, setArrowState] = useState<{ mind: MindElixirInstance | null; enabled: boolean }>({
        mind: null,
        enabled: false,
    });
    const arrowMode = arrowState.mind === mind && arrowState.enabled;
    const arrowControllerRef = useRef<ReturnType<typeof createMindElixirArrowModeController> | null>(null);

    useEffect(() => {
        if (!mind) {
            arrowControllerRef.current = null;
            return;
        }
        let mounted = true;
        const controller = createMindElixirArrowModeController({
            mind,
            onEnabledChange: enabled => {
                if (mounted) setArrowState({ mind, enabled });
            },
        });
        arrowControllerRef.current = controller;
        return () => {
            mounted = false;
            controller.dispose();
            if (arrowControllerRef.current === controller) arrowControllerRef.current = null;
        };
    }, [mind]);

    const handleArrowMode = useCallback(() => {
        arrowControllerRef.current?.toggle();
    }, []);

    const {
        markdownInputRef: fileInputRef,
        opmlInputRef,
        jsonInputRef,
        openMarkdownImport: handleImportMarkdown,
        openOpmlImport: handleImportOpml,
        openJsonImport: handleImportJson,
        handleMarkdownFileChange: handleFileChange,
        handleOpmlFileChange,
        handleJsonFileChange,
    } = useMindElixirImportActions(mind);

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
        <div
            aria-label="思维导图工具"
            className="mind-elixir-toolbar"
            role="toolbar"
        >
            {/* Direction selector */}
            <MindMapDirectionSelector
                currentDirection={currentDir}
                onChange={handleDirectionChange}
                open={openMenu === 'direction'}
                onOpenChange={open => setOpenMenu(open ? 'direction' : null)}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Theme selector */}
            <MindMapThemeSelector
                activeThemeKey={activeThemeKey}
                open={openMenu === 'theme'}
                suppressTooltip={openMenu !== null}
                onOpenChange={open => setOpenMenu(open ? 'theme' : null)}
                onThemeChange={handleThemeChange}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Undo / Redo */}
            <MindMapToolbarIconButton label="撤销 (Ctrl+Z)" icon={<UndoOutlined />} onClick={handleUndo} disabled={!mind} />
            <MindMapToolbarIconButton label="重做 (Ctrl+Y)" icon={<RedoOutlined />} onClick={handleRedo} disabled={!mind} />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Add root child */}
            <MindMapToolbarIconButton label="添加主分支 (Tab)" icon={<PlusOutlined />} onClick={handleAddRootChild} disabled={!mind} />

            {/* Collapse / Expand */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.collapseAll', '折叠全部')} icon={<MenuFoldOutlined />} onClick={handleCollapseAll} disabled={!mind} />
            <MindMapToolbarIconButton label={t('plugins.mindmap.expandAll', '展开全部')} icon={<MenuUnfoldOutlined />} onClick={handleExpandAll} disabled={!mind} />

            {/* Presentation Mode */}
            <MindMapToolbarIconButton
                label={isPresenting ? '退出演示模式' : '演示模式（逐节点呈现）'}
                icon={<PlaySquareOutlined />}
                onClick={handlePresentation}
                disabled={!mind}
                pressed={isPresenting}
                style={{ color: isPresenting ? '#6366f1' : undefined }}
            />

            {/* Focus Mode */}
            <MindMapToolbarIconButton
                label={isFocused ? '退出焦点模式' : '焦点模式（聚焦选中节点）'}
                icon={<AimOutlined />}
                onClick={handleFocusMode}
                disabled={!mind}
                pressed={isFocused}
                style={{ color: isFocused ? '#6366f1' : undefined }}
            />

            {/* Summary node creation */}
            <MindMapToolbarIconButton label="为选中节点创建汇总括号" icon={<BranchesOutlined />} onClick={handleCreateSummary} disabled={!mind} />

            {/* Arrow creation mode */}
            <MindMapToolbarIconButton
                label={arrowMode ? '退出关联线创建模式' : '创建关联线'}
                icon={<ShareAltOutlined />}
                onClick={handleArrowMode}
                disabled={!mind}
                pressed={arrowMode}
                style={{ color: arrowMode ? '#6366f1' : undefined }}
            />

            {/* Auto numbering */}
            <MindMapToolbarIconButton
                label={isNumbering ? '关闭自动编号' : '开启自动编号（每层节点自动加序号）'}
                icon={<OrderedListOutlined />}
                onClick={handleToggleNumbering}
                disabled={!mind}
                pressed={isNumbering}
                style={{ color: isNumbering ? '#6366f1' : undefined }}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Fit to center */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.fitView', '居中')} icon={<FullscreenOutlined />} onClick={handleFitView} disabled={!mind} />
            <MindMapToolbarIconButton label="自动整理分支" icon={<DeploymentUnitOutlined />} onClick={handleAutoArrange} disabled={!mind} />

            {/* Zoom controls */}
            {mind && (
                <div className="mind-elixir-toolbar-zoom" role="group" aria-label="缩放控制">
                    <MindMapToolbarIconButton label="缩小" icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
                    <Tooltip title="点击重置为 100%">
                        <button
                            aria-label={`重置缩放为 100%，当前 ${zoomVal}%`}
                            className={`mind-elixir-toolbar-zoom-reset${zoomVal !== 100 ? ' is-modified' : ''}`}
                            onClick={handleZoomReset}
                            type="button"
                        >
                            {zoomVal}%
                        </button>
                    </Tooltip>
                    <MindMapToolbarIconButton label="放大" icon={<ZoomInOutlined />} onClick={handleZoomIn} />
                </div>
            )}

            {/* Export dropdown */}
            <Dropdown
                open={openMenu === 'export'}
                onOpenChange={open => setOpenMenu(open ? 'export' : null)}
                menu={{ items: exportMenuItems }}
                placement="bottomRight"
                getPopupContainer={getViewportPopupContainer}
                trigger={['click']}
            >
                <MindMapToolbarIconButton aria-expanded={openMenu === 'export'} aria-haspopup="menu" label="导出思维导图" icon={<ExportOutlined />} disabled={!mind} />
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
                open={openMenu === 'import'}
                onOpenChange={open => setOpenMenu(open ? 'import' : null)}
                menu={{
                    items: [
                        { key: 'md',   label: '从 Markdown 导入', icon: <UploadOutlined />, onClick: handleImportMarkdown },
                        { key: 'opml', label: '从 OPML 导入',     icon: <UploadOutlined />, onClick: handleImportOpml },
                        { key: 'json', label: '从 JSON 导入',     icon: <UploadOutlined />, onClick: handleImportJson },
                    ]
                }}
                placement="bottomRight"
                getPopupContainer={getViewportPopupContainer}
                trigger={['click']}
            >
                <MindMapToolbarIconButton aria-expanded={openMenu === 'import'} aria-haspopup="menu" label="导入思维导图" icon={<UploadOutlined />} disabled={!mind} />
            </Dropdown>

            {/* Node stats badge */}
            {mind && stats.nodes > 0 && (
                <Tooltip title={`共 ${stats.nodes} 个节点，最大深度 ${stats.depth} 层`}>
                    <div
                        aria-label={`共 ${stats.nodes} 个节点，最大深度 ${stats.depth} 层`}
                        className="mind-elixir-toolbar-stats"
                        role="status"
                    >
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
            <MindMapToolbarIconButton label="搜索节点 (Ctrl+F)" icon={<SearchOutlined />} onClick={emitOpenSearch} disabled={!mind} />

            {/* Templates */}
            <MindMapTemplates />

            {/* Unified AI assistant */}
            <MindMapToolbarIconButton
                label={isAIPanelOpen ? '关闭 AI 思维导图助手' : '打开 AI 思维导图助手'}
                icon={<RobotOutlined />}
                onClick={handleToggleAIPanel}
                disabled={!mind}
                pressed={isAIPanelOpen}
                style={{ color: isAIPanelOpen ? '#8b5cf6' : undefined }}
            />

            {/* Canvas background preset */}
            <Dropdown
                open={openMenu === 'background'}
                onOpenChange={open => setOpenMenu(open ? 'background' : null)}
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
                getPopupContainer={getViewportPopupContainer}
                trigger={['click']}
            >
                <MindMapToolbarIconButton
                    aria-expanded={openMenu === 'background'}
                    aria-haspopup="menu"
                    label={`画布背景，当前${bgPattern === 'grid' ? '网格' : bgPattern === 'dots' ? '点阵' : '纯色'}`}
                    icon={<AppstoreOutlined />}
                    style={{ color: bgPattern !== 'none' ? '#6366f1' : 'rgba(255,255,255,0.4)' }}
                />
            </Dropdown>

            {/* Outline view toggle */}
            <MindMapToolbarIconButton label="切换大纲视图 (Alt+O)" icon={<UnorderedListOutlined />} onClick={emitToggleOutline} />

            {/* History version toggle */}
            <MindMapToolbarIconButton label="切换历史快照 (Alt+H)" icon={<HistoryOutlined />} onClick={emitToggleHistory} />

            {/* Kanban toggle */}
            <MindMapToolbarIconButton
                label={isKanbanOpen ? '关闭 AI 敏捷任务看板' : '打开 AI 敏捷任务看板'}
                icon={<ProjectOutlined />}
                onClick={handleToggleKanban}
                pressed={isKanbanOpen}
                style={{ color: isKanbanOpen ? '#6366f1' : undefined }}
            />

            {/* Shortcuts help */}
            <MindMapToolbarIconButton
                label="键盘快捷键 (?)"
                icon={<QuestionCircleOutlined />}
                onClick={() => setShortcutsOpen(true)}
                style={{ color: 'rgba(255,255,255,0.4)' }}
            />

            {/* Shortcuts Modal */}
            <MindMapShortcutsModal
                open={shortcutsOpen}
                onClose={() => setShortcutsOpen(false)}
            />
        </div>
    );
};

export default MindElixirToolbar;
