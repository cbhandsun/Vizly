// @ts-nocheck
import React, { useCallback, memo, useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { FaHome, FaRuler, FaExpand, FaCompress, FaFileImage, FaFilePdf, FaFileCode, FaFileVideo, FaDownload, FaSpinner, FaCloudUploadAlt, FaShareAlt, FaFolderOpen } from 'react-icons/fa';
import { useDiagramControls } from '@/core';
import { useTranslation } from 'react-i18next';
import { unifiedStorage } from '../services/UnifiedStorageService';
import { dataRegistry } from '../data/DataRegistry';
import { App, Button, Dropdown, Tooltip, Space, theme, Progress } from 'antd';
import type { MenuProps } from 'antd';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { tryAttachDiagramSnapshot } from '@/core';
import { invalidateRemoteDiagramPreview } from '@/core';
import ShareDialog from '@/components/diagrams/ShareDialog';
import { CloudStorageManagerModal } from '@/components/storage/CloudStorageManagerModal';

interface ExportToolsProps {
  diagramId: string;
  diagramName: string;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  showControls?: boolean;
  variant?: 'overlay' | 'inline';
  enableMainFlowAnimation?: boolean; // 主流程动线控制参数
  /** 如果提供，云端图表将在设计器中打开 */
  onOpenInDesigner?: (data: any) => void;
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
  const { message } = App.useApp();
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { user } = useAuth();
  const { hasFeature, showUpgradeModal } = useSubscription();
  const { handleFitDiagram, handleBackToTop, handleToggleFullscreen: handleFs, exportToPNG, exportToPDF, exportToSVG, exportToGIF } = useDiagramControls(diagramId, enableMainFlowAnimation);
  // 用于 fallback：当 dataService 无数据时从 ReactFlow 获取当前节点/边
  const reactFlowInstance = useReactFlow();
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

  // 保存到云端，返回云端 UUID
  const handleSaveToCloud = useCallback(async (): Promise<string | undefined> => {
    if (!hasFeature('cloud-sync')) {
      showUpgradeModal('云端多人实时协同存储');
      return undefined;
    }

    if (!unifiedStorage.isConfigured()) {
      message.error(`${unifiedStorage.activeProvider.name} 未配置，无法保存`);
      return undefined;
    }

    const hide = message.loading(t('export.savingToCloud'), 0);
    try {
      const dataService = dataRegistry.getDataService();
      let diagram = dataService.getDiagram(diagramId);

      // Fallback: 当 dataService 中无图表数据时（FlowchartDesigner 场景），从 ReactFlow 实例构造
      if (!diagram && reactFlowInstance) {
        const nodes = reactFlowInstance.getNodes();
        const edges = reactFlowInstance.getEdges();
        if (nodes.length > 0) {
          diagram = {
            id: diagramId,
            name: diagramName || diagramId,
            nodes,
            edges,
            metadata: { title: diagramName || diagramId },
          } as any;
        }
      }

      // Fallback 2: 全局数据桥接（当 ExportTools 在 ReactFlowProvider 外部时，如 FlowchartDesigner 场景）
      // 桥接数据已是 StandardDiagramData 格式（由 canvasToStandardData 转换）
      if (!diagram || !diagram.nodes || diagram.nodes.length === 0) {
        const bridgeData = (window as any).__flowDataBridge?.[diagramId];
        if (bridgeData && bridgeData.nodes?.length > 0) {
          diagram = {
            ...bridgeData,
            id: bridgeData.id || diagramId,
            name: diagramName || bridgeData.name || diagramId,
            metadata: { ...(bridgeData.metadata || {}), title: diagramName || bridgeData.metadata?.title || diagramId },
          } as any;
        }
      }

      if (!diagram) {
        message.error('未找到图表数据');
        return undefined;
      }

      const snap = await tryAttachDiagramSnapshot(diagram, diagramId);
      if (snap.warning) {
        message.warning(t('export.snapshotFailed', { reason: snap.warning }));
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
      const bridge = (window as any).__flowDataBridge?.[diagramId];
      if (bridge) {
        bridge.metadata = { ...(bridge.metadata || {}), cloud: cloudInfo };
      }
      // 回写到 dataService（GenericStandardDiagram 场景）
      const currentDiagram = dataService.getDiagram(diagramId);
      if (currentDiagram) {
        (currentDiagram as any).metadata = { ...((currentDiagram as any).metadata || {}), cloud: cloudInfo };
      }

      message.success(t('export.cloudSaveSuccess'));
      return finalId;
    } catch (error) {
      console.error('Cloud save failed', error);
      message.error(t('export.cloudSaveFailed'));
      return undefined;
    } finally {
      hide();
    }
  }, [diagramId, diagramName, t, user?.id, hasFeature, showUpgradeModal]);

  // 确保图表已保存到云端（供 ShareDialog 使用），返回云端 UUID
  const handleEnsureSaved = useCallback(async (): Promise<string | false> => {
    try {
      const cloudId = await handleSaveToCloud();
      return cloudId || false;
    } catch {
      return false;
    }
  }, [handleSaveToCloud]);

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

      <Space size={4}>
        {showControls && (
          <>
            <Tooltip title={t('export.backToTop')} getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}>
              <Button type="text" icon={<FaHome />} onClick={handleBackToTop} disabled={isExporting} />
            </Tooltip>
            <Tooltip title={t('export.fitScreen')} getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}>
              <Button type="text" icon={<FaRuler />} onClick={handleFitDiagram} disabled={isExporting} />
            </Tooltip>
            <Tooltip title={isFullscreen ? t('export.exitFullScreen') : t('export.fullScreen')} getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}>
              <Button
                type="text"
                icon={isFullscreen ? <FaCompress /> : <FaExpand />}
                onClick={() => { onToggleFullscreen?.(); handleFs(); }}
                disabled={isExporting}
              />
            </Tooltip>
            <div style={{ width: 1, height: 16, background: token.colorBorderSecondary, margin: '0 4px' }} />
          </>
        )}

        <Dropdown
          menu={{ items }}
          trigger={['click']}
          placement="bottomRight"
          getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}
        >
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
        </Dropdown>
      </Space>

      <ShareDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        diagramId={diagramId}
        onEnsureSaved={handleEnsureSaved}
      />
      <CloudStorageManagerModal
        open={cloudManagerOpen}
        onCancel={() => setCloudManagerOpen(false)}
        onOpenInDesigner={onOpenInDesigner}
      />
    </>
  );
};

export default memo(ExportTools);
