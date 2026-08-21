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

import React, { useCallback, useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { Divider, Tooltip, Dropdown } from 'antd';
import {
    FullscreenOutlined,
    UndoOutlined,
    RedoOutlined,
    ExportOutlined,
    PlusOutlined,
    DownloadOutlined,
    PlaySquareOutlined,
    UploadOutlined,
    ShareAltOutlined,
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
    OrderedListOutlined,
    BgColorsOutlined,
    BorderlessTableOutlined,
    EllipsisOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MindElixirInstance } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir, setPresentationState, toggleKanban, subscribeKanban, toggleAIPanel, subscribeAIPanel } from './mindElixirStore';
import { countNodes, getTreeDepth } from './migrate';
import { runMindMapToolbarHistoryCommand } from './mindmapToolbarHistoryCommand';
import { VIZLY_THEMES } from './theme';
import { usePresentationMode } from './MindMapPresentationMode';
import { emitOpenSearch } from './mindmapSearchStore';
import MindMapShortcutsModal from './MindMapShortcutsModal';
import MindMapTemplates from './MindMapTemplates';
import { applyMindMapAutoArrangeTransaction } from './mindmapAutoArrange';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import {
    logMindmapToolbarAddRootChildFailure,
    logMindmapToolbarAutoArrangeFailure,
    logMindmapToolbarFitFailure,
    logMindmapToolbarStatsUpdateFailure,
    logMindmapToolbarZoomFailure,
} from './mindmapToolbarLogging';
import {
    getMindMapHistoryAvailability,
    subscribeMindMapHistoryAvailability,
} from './mindMapHistoryAvailability';
import { persistMindMapThemeKey, resolveMindMapThemeKey } from './mindmapThemeStorage';
import { createMindElixirArrowModeController } from './mindElixirArrowModeController';
import { type MindMapImportStatus, useMindElixirImportActions } from './useMindElixirImportActions';
import { type MindMapExportStatus, useMindElixirExportActions } from './useMindElixirExportActions';
import { showMindMapExportFeedback } from './mindMapExportFeedback';
import { useMindElixirCanvasPreferences } from './useMindElixirCanvasPreferences';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import MindMapAuxiliaryPanelButtons from './MindMapAuxiliaryPanelButtons';
import MindMapFocusButton from './MindMapFocusButton';
import MindMapSummaryButton from './MindMapSummaryButton';
import MindMapTreeExpansionButtons from './MindMapTreeExpansionButtons';
import { MindMapThemeSelector } from './MindMapThemeSelector';
import { MindMapDirectionSelector } from './MindMapDirectionSelector';
import { appMessage } from '../../utils/antdStaticBridge';
import { getViewportPopupContainer } from '../ui/viewportOverlayPortal';
import {
    applyMindMapZoomCommand,
    MIND_MAP_MAX_SCALE,
    MIND_MAP_MIN_SCALE,
    toMindMapZoomPercent,
} from './mindMapZoom';
import { fitMindMapToVisibleViewport } from './mindMapVisibleViewportFit';
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
    const presentationTriggerRef = useRef<HTMLButtonElement>(null);
    const presentation = usePresentationMode(
        mind,
        () => {
            setIsPresenting(false);
            setPresentationState(false, null);
        },
        (node) => {
            setPresentationState(true, node);
        },
        {
            returnFocusTarget: () => presentationTriggerRef.current,
            labels: {
                toolbar: t('plugins.mindmap.shortcutHelp.groups.presentation'),
                previous: t('plugins.mindmap.toolbar.presentationPrevious'),
                next: t('plugins.mindmap.toolbar.presentationNext'),
                exit: t('plugins.mindmap.toolbar.presentationExit'),
            },
        },
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

    const handleFitView = useCallback(() => {
        if (!mind) return;
        try {
            fitMindMapToVisibleViewport(mind);
        } catch (error) {
            logMindmapToolbarFitFailure(error);
        }
    }, [mind]);

    const handleAutoArrange = useCallback(() => {
        if (!mind) return;
        try {
            const changed = applyMindMapAutoArrangeTransaction(mind);
            if (!changed) return;
            setTimeout(() => {
                try {
                    mind.toCenter();
                } catch (error) {
                    logMindmapToolbarAutoArrangeFailure(error);
                }
            }, 80);
        } catch (e) {
            logMindmapToolbarAutoArrangeFailure(e);
        }
    }, [mind]);

    const [stats, setStats] = useState({ nodes: 0, depth: 0 });
    const refreshStats = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            setStats({
                nodes: countNodes(data.nodeData),
                depth: getTreeDepth(data.nodeData),
            });
        } catch (error) {
            logMindmapToolbarStatsUpdateFailure(error);
        }
    }, [mind]);

    useEffect(() => {
        if (!mind) return;
        let active = true;
        queueMicrotask(() => {
            if (active) refreshStats();
        });
        mind.bus.addListener('operation', refreshStats);
        return () => {
            active = false;
            mind.bus.removeListener('operation', refreshStats);
        };
    }, [mind, refreshStats]);

    const handleUndo = useCallback(() => {
        if (!mind) return;
        runMindMapToolbarHistoryCommand(mind, 'undo', refreshStats);
    }, [mind, refreshStats]);

    const handleRedo = useCallback(() => {
        if (!mind) return;
        runMindMapToolbarHistoryCommand(mind, 'redo', refreshStats);
    }, [mind, refreshStats]);

    const subscribeHistoryAvailability = useCallback(
        (listener: () => void) => subscribeMindMapHistoryAvailability(mind, listener),
        [mind],
    );
    const getHistoryAvailabilitySnapshot = useCallback(
        () => getMindMapHistoryAvailability(mind),
        [mind],
    );
    const historyAvailability = useSyncExternalStore(
        subscribeHistoryAvailability,
        getHistoryAvailabilitySnapshot,
        getHistoryAvailabilitySnapshot,
    );

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

    const [openMenu, setOpenMenu] = useState<MindMapToolbarMenu | null>(null);
    const exportTriggerRef = useRef<HTMLButtonElement>(null);
    const importTriggerRef = useRef<HTMLButtonElement>(null);
    const restoreExportTriggerFocus = useCallback(() => {
        requestAnimationFrame(() => exportTriggerRef.current?.focus({ preventScroll: true }));
    }, []);
    const handleExportStatus = useCallback((status: MindMapExportStatus) => {
        setOpenMenu(null);
        restoreExportTriggerFocus();
        showMindMapExportFeedback(status, t);
    }, [restoreExportTriggerFocus, t]);

    const {
        activeFormat: activeExportFormat,
        handleExportSvg,
        handleExportPng,
        handleExportMarkdown,
        handleExportOpml,
        handleExportJson,
        handleExportFlowchart,
        handleExportPitchMarkdown,
        handleExportXmind,
        handleExportPdf,
    } = useMindElixirExportActions(mind, { onStatus: handleExportStatus });

    const restoreImportTriggerFocus = useCallback(() => {
        requestAnimationFrame(() => importTriggerRef.current?.focus({ preventScroll: true }));
    }, []);
    const handleImportStatus = useCallback((status: MindMapImportStatus) => {
        appMessage[status.kind === 'error' ? 'error' : 'success'](
            `${status.format}: ${t(status.kind === 'success' ? 'common.success' : 'theme.selector.importStatus.failed')}`,
        );
        restoreImportTriggerFocus();
    }, [restoreImportTriggerFocus, t]);
    const handleImportMenuOpenChange = useCallback((open: boolean) => {
        setOpenMenu(open ? 'import' : null);
        if (!open) restoreImportTriggerFocus();
    }, [restoreImportTriggerFocus]);

    // ── Zoom controls ───────────────────────────────────────────────────────
    const [zoomVal, setZoomVal] = useState(100);
    useEffect(() => {
        if (!mind) return;
        const update = () => setZoomVal(toMindMapZoomPercent(mind.scaleVal));
        update();
        mind.bus.addListener('operation', update);
        return () => { mind.bus.removeListener('operation', update); };
    }, [mind]);

    const handleZoomIn = useCallback(() => {
        if (!mind) return;
        try {
            setZoomVal(applyMindMapZoomCommand(mind, 'in'));
        } catch (error) {
            logMindmapToolbarZoomFailure(error);
        }
    }, [mind]);

    const handleZoomOut = useCallback(() => {
        if (!mind) return;
        try {
            setZoomVal(applyMindMapZoomCommand(mind, 'out'));
        } catch (error) {
            logMindmapToolbarZoomFailure(error);
        }
    }, [mind]);

    const handleZoomReset = useCallback(() => {
        if (!mind) return;
        try {
            setZoomVal(applyMindMapZoomCommand(mind, 'reset'));
        } catch (error) {
            logMindmapToolbarZoomFailure(error);
            return;
        }
        try {
            mind.toCenter();
        } catch (error) {
            logMindmapToolbarZoomFailure(error);
        }
    }, [mind]);

    // Also update zoom on wheel scroll (mind-elixir zoom doesn't emit 'operation')
    useEffect(() => {
        if (!mind) return;
        let timer: ReturnType<typeof setTimeout>;
        const onWheel = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                setZoomVal(toMindMapZoomPercent(mind.scaleVal));
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

    const exportMenuItems = [
        { key: 'svg',      label: t('plugins.mindmap.toolbar.exportSvg'),      icon: <ExportOutlined />,  onClick: handleExportSvg },
        { key: 'png',      label: t('plugins.mindmap.toolbar.exportPng'),      icon: <DownloadOutlined />, onClick: handleExportPng, disabled: activeExportFormat !== null },
        { key: 'xmind',   label: t('plugins.mindmap.toolbar.exportXmind'),    icon: <DownloadOutlined />, onClick: handleExportXmind, disabled: activeExportFormat !== null },
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
    } = useMindElixirImportActions(mind, { onStatus: handleImportStatus });

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

            {/* Keep the task board near help so it remains reachable before horizontal overflow. */}
            <MindMapToolbarIconButton
                data-testid="mindmap-kanban-trigger"
                label={t(isKanbanOpen ? 'plugins.mindmap.toolbar.closeKanban' : 'plugins.mindmap.toolbar.openKanban')}
                icon={<ProjectOutlined />}
                onClick={handleToggleKanban}
                pressed={isKanbanOpen}
                style={{ color: isKanbanOpen ? '#6366f1' : undefined }}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Undo / Redo */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.undo')} icon={<UndoOutlined />} onClick={handleUndo} disabled={!mind || !historyAvailability.canUndo} />
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.redo')} icon={<RedoOutlined />} onClick={handleRedo} disabled={!mind || !historyAvailability.canRedo} />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* Add root child */}
            <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.addRootChild')} icon={<PlusOutlined />} onClick={handleAddRootChild} disabled={!mind} />

            {/* Collapse / Expand */}
            <MindMapTreeExpansionButtons mind={mind} />

            {/* Presentation Mode */}
            <MindMapToolbarIconButton
                data-testid="mindmap-presentation-trigger"
                ref={presentationTriggerRef}
                label={t(isPresenting ? 'plugins.mindmap.toolbar.exitPresentation' : 'plugins.mindmap.toolbar.enterPresentation')}
                icon={<PlaySquareOutlined />}
                onClick={handlePresentation}
                disabled={!mind}
                pressed={isPresenting}
                style={{ color: isPresenting ? '#6366f1' : undefined }}
            />

            {/* Focus Mode */}
            <MindMapFocusButton mind={mind} />

            {/* Summary node creation */}
            <MindMapSummaryButton mind={mind} />

            {/* Arrow creation mode */}
            <MindMapToolbarIconButton
                label={arrowMode
                    ? `${t('plugins.mindmap.toolbar.exitArrowMode')} (Esc)`
                    : t('plugins.mindmap.toolbar.enterArrowMode')}
                icon={<ShareAltOutlined />}
                onClick={handleArrowMode}
                disabled={!mind}
                pressed={arrowMode}
                aria-keyshortcuts={arrowMode ? 'Escape' : undefined}
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
            <MindMapToolbarIconButton
                label={currentDir === 'LR'
                    ? t('plugins.mindmap.toolbar.autoArrange')
                    : `${t('plugins.mindmap.toolbar.autoArrange')} · ${t('plugins.mindmap.toolbar.direction.twoWay')}`}
                icon={<DeploymentUnitOutlined />}
                onClick={handleAutoArrange}
                disabled={!mind || currentDir !== 'LR'}
            />

            {/* Zoom controls */}
            {mind && (
                <div className="mind-elixir-toolbar-zoom" role="group" aria-label={t('plugins.mindmap.toolbar.zoomControls')}>
                    <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.zoomOut')} icon={<ZoomOutOutlined />} onClick={handleZoomOut} disabled={zoomVal <= MIND_MAP_MIN_SCALE * 100} />
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
                    <MindMapToolbarIconButton label={t('plugins.mindmap.toolbar.zoomIn')} icon={<ZoomInOutlined />} onClick={handleZoomIn} disabled={zoomVal >= MIND_MAP_MAX_SCALE * 100} />
                </div>
            )}

            {/* Export dropdown */}
            <Dropdown
                autoFocus
                open={openMenu === 'export'}
                onOpenChange={open => setOpenMenu(open ? 'export' : null)}
                menu={{ items: exportMenuItems }}
                placement="bottomRight"
                getPopupContainer={getViewportPopupContainer}
                trigger={['click']}
            >
                <MindMapToolbarIconButton ref={exportTriggerRef} aria-expanded={openMenu === 'export'} aria-haspopup="menu" label={t('plugins.mindmap.toolbar.exportMindMap')} icon={<ExportOutlined />} disabled={!mind} suppressTooltip={openMenu !== null} />
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
                autoFocus
                open={openMenu === 'import'}
                onOpenChange={handleImportMenuOpenChange}
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
                <MindMapToolbarIconButton ref={importTriggerRef} aria-expanded={openMenu === 'import'} aria-haspopup="menu" label={t('plugins.mindmap.toolbar.importMindMap')} icon={<UploadOutlined />} disabled={!mind} suppressTooltip={openMenu !== null} />
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

            <MindMapAuxiliaryPanelButtons />

            {/* Shortcuts Modal */}
            <MindMapShortcutsModal
                open={shortcutsOpen}
                onClose={() => setShortcutsOpen(false)}
            />
        </div>
    );
};

export default MindElixirToolbar;
