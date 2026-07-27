import React, { useCallback, memo, useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { FaHome, FaRuler, FaExpand, FaCompress, FaFileImage, FaFilePdf, FaFileCode, FaFileVideo, FaDownload, FaSpinner, FaCloudUploadAlt, FaShareAlt, FaFolderOpen } from 'react-icons/fa';
import { useDiagramControls } from '@/core/hooks/useDiagramControls';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, Tooltip, theme, Progress } from 'antd';
import type { MenuProps } from 'antd';
import { useAuth } from '@/context/useAuth';
import { useSubscription } from '@/context/useSubscription';
import { tryAttachDiagramSnapshot } from '@/core/utils/diagramSnapshot';
import { invalidateRemoteDiagramPreview } from '@/services/remoteDiagramPreview';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { getFlowDataBridge, getStandardFlowDataBridge } from '@/core/utils/flowDataBridge';
import { logCloudSaveEnsureFailure, logCloudSaveFailure } from '@/components/diagrams/hooks/diagramStorageLogging';
import { downloadFile } from '@/core/utils/downloadUtils';
import { escapeMarkdownInlineText, escapeMarkdownTableCell, escapeMermaidLabel, toMermaidNodeId } from '@/core/utils/exportTextSecurity';
import type { StandardDiagramData } from '@/core/models/DiagramModels';

const ShareDialog = React.lazy(() => import('@/components/diagrams/ShareDialog'));
const CloudStorageManagerModal = React.lazy(() => import('@/components/storage/CloudStorageManagerModal').then(async (m) => {
  return { default: m.CloudStorageManagerModal };
}));
const loadUnifiedStorage = async () => (await import('../services/UnifiedStorageService')).unifiedStorage;
const loadDataService = async () => {
  const { dataRegistry } = await import('../data/DataRegistry');
  await dataRegistry.initialize();
  return dataRegistry.getDataService();
};

const MARKDOWN_EXPORT_MAX_NODES = 1000;
const MARKDOWN_EXPORT_MAX_EDGES = 2000;

interface ExportToolsProps {
  diagramId: string;
  diagramName: string;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  showControls?: boolean;
  variant?: 'overlay' | 'inline' | 'compact';
  enableMainFlowAnimation?: boolean; // 主流程动线控制参数
  /** 如果提供，云端图表将在设计器中打开 */
  onOpenInDesigner?: (data: StandardDiagramData) => void;
}

/**
 * 导出工具组件
 * 使用 Ant Design 组件重构，提供现代化的 UI
 */
const ExportTools: React.FC<ExportToolsProps> = ({
  diagramId,
  diagramName,
  onToggleFullscreen,
  isFullscreen = false,
  showControls = true,
  variant = 'overlay',
  enableMainFlowAnimation = true,
  onOpenInDesigner
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { user } = useAuth();
  const { hasFeature, showUpgradeModal } = useSubscription();
  // 用于 fallback：当 dataService 无数据时从 ReactFlow 获取当前节点/边
  const reactFlowInstance = useReactFlow();
  const getReactFlowSnapshot = useCallback(() => ({
    nodes: reactFlowInstance.getNodes(),
    edges: reactFlowInstance.getEdges(),
    viewport: reactFlowInstance.getViewport(),
  }), [reactFlowInstance]);
  const { handleFitDiagram, handleBackToTop, handleToggleFullscreen: handleFs, exportToPNG, exportToPDF, exportToSVG, exportToGIF } = useDiagramControls(
    diagramId,
    enableMainFlowAnimation,
    { getReactFlowSnapshot },
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<'png' | 'pdf' | 'svg' | 'gif' | null>(null);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [cloudManagerOpen, setCloudManagerOpen] = useState(false);

  /**
   * 等待浏览器完成一次绘制（使用 requestAnimationFrame）。
   */
  const waitForNextPaint = useCallback(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  }), []);

  // 监听导出进度事件，显示遮罩与进度条
  useEffect(() => {
    const matchesEvent = (evtDiagramId?: string): boolean => {
      if (!evtDiagramId) return true;
      if (evtDiagramId === diagramId) return true;
      if (variant === 'inline') return true;
      return false;
    };

    const handleStart = (e: Event) => {
      const ce = e as CustomEvent<{ diagramId: string; type: 'png' | 'pdf' | 'svg' | 'gif' }>;
      if (!ce.detail || !matchesEvent(ce.detail.diagramId)) return;
      setIsExporting(true);
      setExportType(ce.detail.type);
      setExportProgress(0);
    };

    const handleProgress = (e: Event) => {
      const ce = e as CustomEvent<{ diagramId: string; type: 'gif'; progress: number; frameIndex?: number; frameCount?: number; stage?: string }>;
      if (!ce.detail || !matchesEvent(ce.detail.diagramId)) return;
      if (ce.detail.type !== 'gif') return;
      setExportProgress(Math.min(1, Math.max(0, ce.detail.progress ?? 0)));
    };

    const handleComplete = (e: Event) => {
      const ce = e as CustomEvent<{ diagramId: string; type: 'png' | 'pdf' | 'svg' | 'gif' }>;
      if (!ce.detail || !matchesEvent(ce.detail.diagramId)) return;
      setIsExporting(false);
      setExportType(null);
      setExportProgress(0);
    };

    const handleError = (e: Event) => {
      const ce = e as CustomEvent<{ diagramId: string; type: 'png' | 'pdf' | 'svg' | 'gif'; error?: unknown }>;
      if (!ce.detail || !matchesEvent(ce.detail.diagramId)) return;
      setIsExporting(false);
      setExportType(null);
      setExportProgress(0);
    };

    window.addEventListener('diagramExportStart', handleStart as EventListener);
    window.addEventListener('diagramExportProgress', handleProgress as EventListener);
    window.addEventListener('diagramExportComplete', handleComplete as EventListener);
    window.addEventListener('diagramExportError', handleError as EventListener);
    return () => {
      window.removeEventListener('diagramExportStart', handleStart as EventListener);
      window.removeEventListener('diagramExportProgress', handleProgress as EventListener);
      window.removeEventListener('diagramExportComplete', handleComplete as EventListener);
      window.removeEventListener('diagramExportError', handleError as EventListener);
    };
  }, [diagramId, variant]);

  // 导出操作包装
  const wrapExport = async (type: 'png' | 'pdf' | 'svg' | 'gif', fn: () => Promise<void>) => {
    try {
      setIsExporting(true);
      setExportType(type);
      await waitForNextPaint();
      await fn();
    } finally {
      // 状态重置由事件监听处理，这里仅作为 fallback
    }
  };

  const handleExportPNG = () => wrapExport('png', exportToPNG);
  const handleExportPDF = () => {
    if (!hasFeature('export-pdf')) {
      showUpgradeModal('超高清 PDF 导出');
      return;
    }
    wrapExport('pdf', exportToPDF);
  };
  const handleExportSVG = () => {
    if (!hasFeature('export-hd-svg')) {
      showUpgradeModal('超高清矢量 SVG 导出');
      return;
    }
    wrapExport('svg', exportToSVG);
  };
  const handleExportGIF = () => wrapExport('gif', exportToGIF);
  
  const handleExportMarkdown = async () => {
    const dataService = await loadDataService();
    let diagram = dataService.getDiagram(diagramId);
    
    // Fallback Bridge
    if (!diagram || !diagram.nodes || diagram.nodes.length === 0) {
      const bridgeData = getStandardFlowDataBridge(diagramId);
      if (bridgeData) diagram = bridgeData;
    }

    if (!diagram) {
       appMessage.error('未找到图表数据，无法导出 Markdown');
       return;
    }

    const safeNodes = (diagram.nodes || []).slice(0, MARKDOWN_EXPORT_MAX_NODES);
    const safeNodeIds = new Set(safeNodes.map(n => n.id));
    const safeEdges = (diagram.edges || [])
      .filter(e => safeNodeIds.has(e.source) && safeNodeIds.has(e.target))
      .slice(0, MARKDOWN_EXPORT_MAX_EDGES);

    const nodeDetails = safeNodes.map(n => `| ${escapeMarkdownTableCell(n.id)} | ${escapeMarkdownTableCell(n.data?.label || n.id)} | ${escapeMarkdownTableCell(n.data?.domainClass || n.type || 'N/A')} | ${escapeMarkdownTableCell(n.data?.description || '')} |`).join('\n');
    const edgeDetails = safeEdges.map(e => `- ${escapeMarkdownTableCell(e.source)} --> ${escapeMarkdownTableCell(e.target)}${e.label ? `: ${escapeMarkdownTableCell(e.label)}` : ''}`).join('\n');

    const mermaid = `graph TD\n` + safeEdges.map(e => {
      const sourceId = toMermaidNodeId(e.source);
      const targetId = toMermaidNodeId(e.target);
      const sourceLabel = escapeMermaidLabel(safeNodes.find(n => n.id === e.source)?.data?.label || e.source);
      const targetLabel = escapeMermaidLabel(safeNodes.find(n => n.id === e.target)?.data?.label || e.target);
      const edgeLabel = escapeMermaidLabel(e.label || '');
      return edgeLabel
        ? `  ${sourceId}["${sourceLabel}"] -->|"${edgeLabel}"| ${targetId}["${targetLabel}"]`
        : `  ${sourceId}["${sourceLabel}"] --> ${targetId}["${targetLabel}"]`;
    }).join('\n');

    const content = `# Architecture Blueprint: ${escapeMarkdownInlineText(diagramName || 'Untitled')}

## 1. Overview
This architectural blueprint was generated by Vizly AI Studio.

## 2. Component Inventory
| ID | Label | Layer (Domain) | Description |
|---|---|---|---|
${nodeDetails}

## 3. Interaction Flows
${edgeDetails}

## 4. Logical Visual (Mermaid)
\`\`\`mermaid
${mermaid}
\`\`\`

---
*Generated by Vizly AI Studio - ${new Date().toLocaleString()}*
`;

    downloadFile(content, `${diagramName || 'blueprint'}.md`, 'text/markdown');
    appMessage.success('📄 文档已导出为 Markdown');
  };

  // 保存到云端，返回云端 UUID
  const handleSaveToCloud = useCallback(async (): Promise<string | undefined> => {
    if (!hasFeature('cloud-sync')) {
      showUpgradeModal('云端多人实时协同存储');
      return undefined;
    }

    const unifiedStorage = await loadUnifiedStorage();

    if (!unifiedStorage.isConfigured()) {
      appMessage.error(`${unifiedStorage.activeProvider.name} 未配置，无法保存`);
      return undefined;
    }

    const hide = appMessage.loading(t('export.savingToCloud'), 0);
    try {
      const dataService = await loadDataService();
      let diagram = dataService.getDiagram(diagramId);

      // Fallback: 当 dataService 中无图表数据时（FlowchartDesigner 场景），从 ReactFlow 实例构造
      if (!diagram && reactFlowInstance) {
        const nodes = reactFlowInstance.getNodes();
        const edges = reactFlowInstance.getEdges();
        if (nodes.length > 0) {
          const { canvasToStandardData } = await import('@/core/components/diagrams/designerUtils');
          diagram = canvasToStandardData(nodes, edges, diagramName || diagramId);
          diagram = {
            ...diagram,
            id: diagramId,
            name: diagramName || diagramId,
            metadata: { ...diagram.metadata, title: diagramName || diagramId },
          };
        }
      }

      // Fallback 2: 全局数据桥接（当 ExportTools 在 ReactFlowProvider 外部时，如 FlowchartDesigner 场景）
      // 桥接数据已是 StandardDiagramData 格式（由 canvasToStandardData 转换）
      if (!diagram || !diagram.nodes || diagram.nodes.length === 0) {
        const bridgeData = getStandardFlowDataBridge(diagramId);
        if (bridgeData && bridgeData.nodes.length > 0) {
          diagram = {
            ...bridgeData,
            id: bridgeData.id || diagramId,
            name: diagramName || bridgeData.name || diagramId,
            metadata: { ...(bridgeData.metadata || {}), title: diagramName || bridgeData.metadata?.title || diagramId },
          };
        }
      }

      if (!diagram) {
        appMessage.error('未找到图表数据');
        return undefined;
      }

      const snap = await tryAttachDiagramSnapshot(diagram, diagramId);
      if (snap.warning) {
        appMessage.warning(t('export.snapshotFailed', { reason: snap.warning }));
      }

      const cloudProvider = snap.diagram.metadata?.cloud?.provider;
      const cloudId = snap.diagram.metadata?.cloud?.id;
      const provider = cloudProvider ? unifiedStorage.getProvider(cloudProvider) : unifiedStorage.activeProvider;
      // 如果没有云端 ID，且本地 ID 不是合法 UUID，则生成新 UUID
      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snap.diagram.id);
      const finalId = cloudId || (isValidUuid ? snap.diagram.id : crypto.randomUUID());
      const finalTitle = diagramName || snap.diagram.metadata?.title || snap.diagram.name;

      await provider.saveDiagram({
        id: finalId,
        title: finalTitle,
        content: { ...snap.diagram, id: finalId, name: finalTitle },
        updated_at: new Date().toISOString(),
        user_id: user?.id || 'anonymous'
      });
      invalidateRemoteDiagramPreview(finalId);

      // ⭐ 回写 cloud 信息，使下次保存复用同一 ID（更新而非新增）
      const cloudInfo = { provider: provider.id, id: finalId, title: finalTitle, openedAt: new Date().toISOString() };
      // 回写到桥接数据（FlowchartDesigner 场景）
      const bridge = getFlowDataBridge(diagramId);
      if (bridge) {
        bridge.metadata = { ...(bridge.metadata || {}), cloud: cloudInfo };
      }
      // 回写到 dataService（GenericStandardDiagram 场景）
      const currentDiagram = dataService.getDiagram(diagramId);
      if (currentDiagram) {
        currentDiagram.metadata = { ...(currentDiagram.metadata || {}), cloud: cloudInfo };
      }

      appMessage.success(t('export.cloudSaveSuccess'));
      return finalId;
    } catch (error) {
      logCloudSaveFailure('ExportTools', error);
      appMessage.error(t('export.cloudSaveFailed'));
      return undefined;
    } finally {
      hide();
    }
  }, [diagramId, diagramName, t, user?.id, hasFeature, showUpgradeModal, reactFlowInstance]);

  // 确保图表已保存到云端（供 ShareDialog 使用），返回云端 UUID
  const handleEnsureSaved = useCallback(async (): Promise<string | false> => {
    try {
      const cloudId = await handleSaveToCloud();
      return cloudId || false;
    } catch (error) {
      logCloudSaveEnsureFailure(diagramId, error);
      return false;
    }
  }, [diagramId, handleSaveToCloud]);

  const items: MenuProps['items'] = [
    {
      key: 'png',
      label: t('export.png'),
      icon: <FaFileImage />,
      onClick: handleExportPNG,
      disabled: isExporting
    },
    {
      key: 'pdf',
      label: t('export.pdf'),
      icon: <FaFilePdf />,
      onClick: handleExportPDF,
      disabled: isExporting
    },
    {
      key: 'svg',
      label: t('export.svg'),
      icon: <FaFileCode />,
      onClick: handleExportSVG,
      disabled: isExporting
    },
    {
      key: 'gif',
      label: t('export.gif'),
      icon: <FaFileVideo />,
      onClick: handleExportGIF,
      disabled: isExporting
    },
    {
      key: 'markdown',
      label: 'Markdown 文档 (.md)',
      icon: <FaFileCode />,
      onClick: handleExportMarkdown,
      disabled: isExporting
    },
    {
      type: 'divider',
    },
    {
      key: 'cloud',
      label: t('export.saveToCloud'),
      icon: <FaCloudUploadAlt style={{ color: token.colorSuccess }} />,
      onClick: handleSaveToCloud,
      disabled: isExporting
    },
    {
      key: 'openCloud',
      label: t('storage.manager.title', '云端文件'),
      icon: <FaFolderOpen style={{ color: token.colorWarning }} />,
      onClick: () => setCloudManagerOpen(true),
      disabled: isExporting
    },
    {
      key: 'share',
      label: t('share.shareButton'),
      icon: <FaShareAlt style={{ color: token.colorPrimary }} />,
      onClick: () => setShareDialogOpen(true),
      disabled: isExporting
    }
  ];

  return (
    <>
      {/* 导出遮罩 */}
      {isExporting && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: token.colorBgMask,
            backdropFilter: 'blur(4px)',
            zIndex: 2147483647,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              padding: '24px',
              borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              background: token.colorBgElevated,
              border: `1px solid ${token.colorBorder}`
            }}
          >
            <FaSpinner className="animate-spin" size={32} style={{ color: token.colorPrimary }} />
            <div style={{ color: token.colorText, fontWeight: 600 }}>
              {t('export.exporting')}{exportType ? exportType.toUpperCase() : ''}...
            </div>
            {exportType === 'gif' && (
              <div style={{ width: '256px' }}>
                <Progress percent={Math.round((exportProgress ?? 0) * 100)} size="small" status="active" />
              </div>
            )}
            <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>
              {t('export.wait')}
            </div>
          </div>
        </div>,
        (document.fullscreenElement as HTMLElement | null) || document.body
      )}

      <div className="flex items-center gap-0.5">
        {showControls && (
          <>
            <Tooltip title={t('export.backToTop')} getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}>
              <Button type="text" aria-label={t('export.backToTop')} icon={<FaHome className="text-[13px]" />} onClick={handleBackToTop} disabled={isExporting} className="w-8 h-8 p-0 border-none flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] transition-colors" />
            </Tooltip>
            <Tooltip title={t('export.fitScreen')} getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}>
              <Button type="text" aria-label={t('export.fitScreen')} icon={<FaRuler className="text-[13px]" />} onClick={handleFitDiagram} disabled={isExporting} className="w-8 h-8 p-0 border-none flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] transition-colors" />
            </Tooltip>
            <Tooltip title={isFullscreen ? t('export.exitFullScreen') : t('export.fullScreen')} getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}>
              <Button
                type="text"
                aria-label={isFullscreen ? t('export.exitFullScreen') : t('export.fullScreen')}
                icon={isFullscreen ? <FaCompress className="text-[13px]" /> : <FaExpand className="text-[13px]" />}
                onClick={() => { onToggleFullscreen?.(); handleFs(); }}
                disabled={isExporting}
                className="w-8 h-8 p-0 border-none flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] transition-colors"
              />
            </Tooltip>
            <div className="w-[1px] h-4 bg-slate-200/80 dark:bg-white/10 mx-0.5 flex-shrink-0" />
          </>
        )}

        <Dropdown
          menu={{ items }}
          trigger={['click']}
          placement="bottomRight"
          getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}
        >
          {variant === 'compact' ? (
            <Button
              type="text"
              aria-label={t('common.export', '导出')}
              icon={<FaDownload className="text-[13px]" />}
              className="w-8 h-8 p-0 border-none flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] transition-colors"
              disabled={isExporting}
            />
          ) : (
            <Button
              icon={<FaDownload size={14} />}
              style={variant === 'inline' ? {
                height: 32,
                display: 'flex',
                alignItems: 'center',
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorder}`,
                borderRadius: 6,
                padding: '0 12px',
                fontSize: 13,
                cursor: 'pointer',
                color: token.colorText,
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              } : undefined}
            >
              {t('export.export')}
            </Button>
          )}
        </Dropdown>
      </div>

      {shareDialogOpen && (
        <React.Suspense fallback={null}>
          <ShareDialog
            open={shareDialogOpen}
            onClose={() => setShareDialogOpen(false)}
            diagramId={diagramId}
            onEnsureSaved={handleEnsureSaved}
          />
        </React.Suspense>
      )}

      {cloudManagerOpen && (
        <React.Suspense fallback={null}>
          <CloudStorageManagerModal
            open={cloudManagerOpen}
            onCancel={() => setCloudManagerOpen(false)}
            onOpenInDesigner={onOpenInDesigner}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default memo(ExportTools);
