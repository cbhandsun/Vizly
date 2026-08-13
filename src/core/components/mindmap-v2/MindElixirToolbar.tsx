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
    BgColorsOutlined,
    BorderlessTableOutlined,
    EllipsisOutlined,
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
        numberingEnabled: isNumbering,
        toggleNumbering: handleToggleNumbering,
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

    const { isFocused, toggleFocusMode } = useMindMapFocusMode(
        mind,
        logMindmapToolbarFocusModeFailure,
    );
    const handleFocusMode = useCallback(() => {
        try {
            toggleFocusMode();
        } catch (error) {
            logMindmapToolbarFocusModeFailure(error);
        }
    }, [toggleFocusMode]);

    const exportMenuItems = [
        { key: 'svg',      label: t('plugins.mindmap.toolbar.exportSvg'),      icon: <ExportOutlined />,  onClick: handleExportSvg },
        { key: 'png',      label: t('plugins.mindmap.toolbar.exportPng'),      icon: <DownloadOutlined />, onClick: handleExportPng },
        { key: 'xmind',   label: t('plugins.mindmap.toolbar.exportXmind'),    icon: <DownloadOutlined />, onClick: handleExportXmind },
        { type: 'divider' as const },
        { key: 'markdown', label: t('plugins.mindmap.toolbar.exportMarkdown'), icon: <DownloadOutlined />, onClick: handleExportMarkdown },
        { key: 'opml',     label: t('plugins.mindmap.toolbar.exportOpml'),     icon: <DownloadOutlined />, onClick: handleExportOpml },
        { key: 'json',     label: t('plugins.mindmap.toolbar.exportJson'),     icon: <DownloadOutlined />, onClick: handleExportJson },
        { type: 'divider' as const },
        { key: 'pitch-md', label: t('plugins.mindmap.toolbar.exportPitchMarkdown'), icon: <PlaySquareOutlined />, onClick: handleExportPitchMarkdown },
        { type: 'divider' as const },
        { key: 'flowchart',label: t('plugins.mindmap.toolbar.exportFlowchart'), icon: <ShareAltOutlined />, onClick: handleExportFlowchart },
        { type: 'divider' as const },
        { key: 'pdf',      label: t('plugins.mindmap.toolbar.printPdf'),    icon: <PrinterOutlined />,  onClick: handleExportPdf },
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
            aria-label={t('plugins.mindmap.toolbar.label')}
            className="vizly-mindmap-toolbar"
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

            {/* Keep help near the start so it remains reachable before horizontal overflow. */}
            <MindMapToolbarIconButton
                data-testid="mindmap-shortcuts-trigger"
                label={t('plugins.mindmap.toolbar.shortcuts')}
                icon={<QuestionCircleOutlined />}
                onClick={() => setShortcutsOpen(true)}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Undo / Redo */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.undo')} icon={<UndoOutlined />} onClick={handleUndo} disabled={!mind} />
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.redo')} icon={<RedoOutlined />} onClick={handleRedo} disabled={!mind} />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Add root child */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.addRootChild')} icon={<PlusOutlined />} onClick={handleAddRootChild} disabled={!mind} />

            {/* Collapse / Expand */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.collapseAll')} icon={<MenuFoldOutlined />} onClick={handleCollapseAll} disabled={!mind} />
            <MindMapToolbarIconButton label={t('plugins.mindmap.expandAll')} icon={<MenuUnfoldOutlined />} onClick={handleExpandAll} disabled={!mind} />

            {/* Presentation Mode */}
            <MindMapToolbarIconButton
                label={t(isPresenting ? 'plugins.mindmap.toolbar.exitPresentation' : 'plugins.mindmap.toolbar.enterPresentation')}
                icon={<PlaySquareOutlined />}
                onClick={handlePresentation}
                disabled={!mind}
                pressed={isPresenting}
                style={{ color: isPresenting ? '#6366f1' : undefined }}
            />

            {/* Focus Mode */}
            <MindMapToolbarIconButton
                label={t(isFocused ? 'plugins.mindmap.toolbar.exitFocus' : 'plugins.mindmap.toolbar.enterFocus')}
                icon={<AimOutlined />}
                onClick={handleFocusMode}
                disabled={!mind}
                pressed={isFocused}
                style={{ color: isFocused ? '#6366f1' : undefined }}
            />

            {/* Summary node creation */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.createSummary')} icon={<BranchesOutlined />} onClick={handleCreateSummary} disabled={!mind} />

            {/* Arrow creation mode */}
            <MindMapToolbarIconButton
                label={t(arrowMode ? 'plugins.mindmap.toolbar.exitArrowMode' : 'plugins.mindmap.toolbar.enterArrowMode')}
                icon={<ShareAltOutlined />}
                onClick={handleArrowMode}
                disabled={!mind}
                pressed={arrowMode}
                style={{ color: arrowMode ? '#6366f1' : undefined }}
            />

            {/* Auto numbering */}
            <MindMapToolbarIconButton
                label={t(isNumbering ? 'plugins.mindmap.toolbar.disableNumbering' : 'plugins.mindmap.toolbar.enableNumbering')}
                icon={<OrderedListOutlined />}
                onClick={handleToggleNumbering}
                disabled={!mind}
                pressed={isNumbering}
                style={{ color: isNumbering ? '#6366f1' : undefined }}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Fit to center */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.fitView')} icon={<FullscreenOutlined />} onClick={handleFitView} disabled={!mind} />
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.autoArrange')} icon={<DeploymentUnitOutlined />} onClick={handleAutoArrange} disabled={!mind} />

            {/* Zoom controls */}
            {mind && (
                <div className="mind-elixir-toolbar-zoom" role="group" aria-label={t('plugins.mindmap.toolbar.zoomControls')}>
                    <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.zoomOut')} icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
                    <Tooltip title={t('plugins.mindmap.toolbar.zoomResetTooltip')}>
                        <button
                            aria-label={t('plugins.mindmap.toolbar.zoomResetLabel', { zoom: zoomVal })}
                            className={`mind-elixir-toolbar-zoom-reset${zoomVal !== 100 ? ' is-modified' : ''}`}
                            onClick={handleZoomReset}
                            type="button"
                        >
                            {zoomVal}%
                        </button>
                    </Tooltip>
                    <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.zoomIn')} icon={<ZoomInOutlined />} onClick={handleZoomIn} />
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
                <MindMapToolbarIconButton aria-expanded={openMenu === 'export'} aria-haspopup="menu" label={t('plugins.mindmap.toolbar.exportMindMap')} icon={<ExportOutlined />} disabled={!mind} suppressTooltip={openMenu !== null} />
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
                        { key: 'md',   label: t('plugins.mindmap.toolbar.importMarkdown'), icon: <UploadOutlined />, onClick: handleImportMarkdown },
                        { key: 'opml', label: t('plugins.mindmap.toolbar.importOpml'),     icon: <UploadOutlined />, onClick: handleImportOpml },
                        { key: 'json', label: t('plugins.mindmap.toolbar.importJson'),     icon: <UploadOutlined />, onClick: handleImportJson },
                    ]
                }}
                placement="bottomRight"
                getPopupContainer={getViewportPopupContainer}
                trigger={['click']}
            >
                <MindMapToolbarIconButton aria-expanded={openMenu === 'import'} aria-haspopup="menu" label={t('plugins.mindmap.toolbar.importMindMap')} icon={<UploadOutlined />} disabled={!mind} suppressTooltip={openMenu !== null} />
            </Dropdown>

            {/* Node stats badge */}
            {mind && stats.nodes > 0 && (
                <Tooltip title={t('plugins.mindmap.toolbar.stats', { nodes: stats.nodes, depth: stats.depth })}>
                    <div
                        aria-label={t('plugins.mindmap.toolbar.stats', { nodes: stats.nodes, depth: stats.depth })}
                        className="mind-elixir-toolbar-stats"
                        role="status"
                    >
                        <BarChartOutlined style={{ fontSize: 11, color: '#6366f1' }} />
                        <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>
                            {t('plugins.mindmap.toolbar.nodesShort', { count: stats.nodes })}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(99,102,241,0.6)' }}>
                            /{t('plugins.mindmap.toolbar.depthShort', { count: stats.depth })}
                        </span>
                    </div>
                </Tooltip>
            )}

            {/* Search */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.search')} icon={<SearchOutlined />} onClick={emitOpenSearch} disabled={!mind} />

            {/* Templates */}
            <MindMapTemplates />

            {/* Unified AI assistant */}
            <MindMapToolbarIconButton
                label={t(isAIPanelOpen ? 'plugins.mindmap.toolbar.closeAiAssistant' : 'plugins.mindmap.toolbar.openAiAssistant')}
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
                            key: 'none', label: t('plugins.mindmap.toolbar.backgroundSolid'),
                            icon: <BgColorsOutlined />,
                            onClick: () => applyBgPattern('none'),
                        },
                        {
                            key: 'grid', label: t('plugins.mindmap.toolbar.backgroundGrid'),
                            icon: <BorderlessTableOutlined />,
                            onClick: () => applyBgPattern('grid'),
                        },
                        {
                            key: 'dots', label: t('plugins.mindmap.toolbar.backgroundDots'),
                            icon: <EllipsisOutlined />,
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
                    label={t('plugins.mindmap.toolbar.backgroundCurrent', {
                        background: t(`plugins.mindmap.toolbar.backgroundNames.${bgPattern}`),
                    })}
                    icon={<AppstoreOutlined />}
                    suppressTooltip={openMenu !== null}
                    style={{ color: bgPattern !== 'none' ? '#6366f1' : 'rgba(255,255,255,0.4)' }}
                />
            </Dropdown>

            {/* Outline view toggle */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.toggleOutline')} icon={<UnorderedListOutlined />} onClick={emitToggleOutline} />

            {/* History version toggle */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.toggleHistory')} icon={<HistoryOutlined />} onClick={emitToggleHistory} />

            {/* Kanban toggle */}
            <MindMapToolbarIconButton
                label={t(isKanbanOpen ? 'plugins.mindmap.toolbar.closeKanban' : 'plugins.mindmap.toolbar.openKanban')}
                icon={<ProjectOutlined />}
                onClick={handleToggleKanban}
                pressed={isKanbanOpen}
                style={{ color: isKanbanOpen ? '#6366f1' : undefined }}
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
