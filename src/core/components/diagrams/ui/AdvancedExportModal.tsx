import React, { useMemo, useState } from 'react';
import { Modal, Radio, Checkbox, Select, Button, Space, Divider } from 'antd';
import { 
  DownloadOutlined, 
  CopyOutlined, 
  FileImageOutlined,
  FilePdfOutlined,
  CodeOutlined,
  CameraOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { copyImageToClipboard, ExportOptions } from '../../../utils/imageExporter';
import { useDiagramStore } from '../../../store/useDiagramStore';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { runAdvancedExport } from '../advancedExportActions';
import { isSceneBasedAdvancedExportFormat } from '../advancedExportMode';
import {
  buildRenderSceneFromGlobalReactFlow,
  buildRenderSceneFromReactFlowSnapshot,
  type ReactFlowRenderSnapshot,
} from '../../../rendering/reactFlowScene';
import { buildSvgPreviewModel, type SvgPreviewModel } from '../../../export/svgPreviewModel';
import { isSafeExportDataUrl } from '../../shared/exportUtils';
import './AdvancedExportModal.css';


interface AdvancedExportModalProps {
  visible: boolean;
  onClose: () => void;
  diagramId?: string;
  diagramTitle?: string;
  getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
}

export const AdvancedExportModeNotice: React.FC<{
  format: ExportOptions['format'];
  hasSnapshotProvider: boolean;
}> = ({ format, hasSnapshotProvider }) => {
  const { t } = useTranslation();
  const usesScenePath = isSceneBasedAdvancedExportFormat(format) && hasSnapshotProvider;
  const message = usesScenePath
    ? t(
      'advancedExport.sceneBasedHint',
      'PNG/SVG exports are rendered from the current canvas data for a reliable result.',
    )
    : t(
      'advancedExport.legacyExportHint',
      'The selected format uses the standard export engine.',
    );

  return (
    <div
      data-testid="advanced-export-mode-notice"
      style={{
        marginTop: 20,
        padding: '12px',
        background: 'rgba(0,0,0,0.03)',
        border: '1px solid rgba(0,0,0,0.05)',
        borderRadius: 8,
        fontSize: '12px',
        color: '#666',
      }}
    >
      <Space>
        <CameraOutlined />
        <span>{message}</span>
      </Space>
    </div>
  );
};

export const SvgExportPreview: React.FC<{
  visible: boolean;
  getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
}> = ({ visible, getReactFlowSnapshot }) => {
  const { t } = useTranslation();
  const { svgPreview, svgPreviewError } = useMemo<{
    svgPreview: SvgPreviewModel | null;
    svgPreviewError: boolean;
  }>(() => {
    if (!visible) return { svgPreview: null, svgPreviewError: false };
    try {
      const snapshot = getReactFlowSnapshot?.();
      const scene = snapshot
        ? buildRenderSceneFromReactFlowSnapshot(snapshot, { padding: 40 })
        : buildRenderSceneFromGlobalReactFlow({ padding: 40 });
      const preview = buildSvgPreviewModel(scene, { title: 'advanced-export-preview', maxPreviewSide: 360 });
      const isSafePreview = isSafeExportDataUrl(preview.dataUrl);
      return { svgPreview: isSafePreview ? preview : null, svgPreviewError: !isSafePreview };
    } catch {
      return { svgPreview: null, svgPreviewError: true };
    }
  }, [getReactFlowSnapshot, visible]);

  if (!visible) return null;

  return (
    <>
      <Divider style={{ margin: '16px 0' }} />
      {svgPreview ? (
        <div
          data-testid="svg-export-preview"
          style={{
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 8,
            background: '#fff',
            padding: 12,
          }}
        >
          <div
            style={{
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: '#f8fafc',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
            }}
          >
            <img
              src={svgPreview.dataUrl}
              alt={t('advancedExport.svgPreviewAlt', 'SVG preview')}
              style={{
                width: svgPreview.previewWidth,
                height: svgPreview.previewHeight,
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              color: '#64748b',
              fontSize: 12,
            }}
          >
            <span>{svgPreview.width} x {svgPreview.height}</span>
            <span>{svgPreview.nodeCount} nodes / {svgPreview.edgeCount} edges</span>
            <span>{Math.ceil(svgPreview.byteLength / 1024)} KB</span>
          </div>
        </div>
      ) : svgPreviewError ? (
        <div
          data-testid="svg-export-preview-error"
          role="status"
          style={{
            border: '1px solid #fbbf24',
            borderRadius: 8,
            background: '#fffbeb',
            color: '#92400e',
            padding: 12,
            fontSize: 12,
          }}
        >
          {t('advancedExport.svgPreviewUnavailable', 'SVG preview unavailable')}
        </div>
      ) : null}
    </>
  );
};

/**
 * 高级导出模态框 (Phase 10)
 * 提供清晰度选择、背景控制、元数据注入及一键拷贝功能
 */
export const AdvancedExportModal: React.FC<AdvancedExportModalProps> = ({ visible, onClose, diagramId, diagramTitle, getReactFlowSnapshot }) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportOptions['format']>('png');
  const [pixelRatio, setPixelRatio] = useState<number>(2);
  const [includeBackground, setIncludeBackground] = useState<boolean>(true);
  const [embedMetadata, setEmbedMetadata] = useState<boolean>(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const currentNodes = useDiagramStore.getState().nodes;
      await runAdvancedExport({
        diagramId,
        diagramTitle,
        nodes: currentNodes,
        format,
        pixelRatio,
        includeBackground,
        embedMetadata,
        getReactFlowSnapshot,
      });
      appMessage.success(t('advancedExport.successMsg', { format: format.toUpperCase() }));
      onClose();
    } catch (_e) {
      appMessage.error(t('advancedExport.errorMsg'));
    } finally {
      setExporting(false);
    }
  };

  const handleCopyClipboard = async () => {
    const currentNodes = useDiagramStore.getState().nodes;
    const success = await copyImageToClipboard(currentNodes);
    if (success) {
      appMessage.success(t('advancedExport.copySuccess'));
      onClose();
    } else {
      appMessage.error(t('advancedExport.copyFailed'));
    }
  };

  return (
    <Modal
      rootClassName="advanced-export-modal"
      title={<span><DownloadOutlined /> {t('advancedExport.title')}</span>}
      open={visible}
      onCancel={onClose}
      closable={{
        'aria-label': t('common.close'),
        disabled: exporting,
      }}
      keyboard={!exporting}
      mask={{ closable: !exporting }}
      footer={[
        <Button
          key="copy"
          icon={<CopyOutlined />}
          aria-label={t('advancedExport.copyClipboard')}
          disabled={exporting}
          onClick={handleCopyClipboard}
        >
          {t('advancedExport.copyClipboard')}
        </Button>,
        <Button key="cancel" disabled={exporting} onClick={onClose}>
          {t('advancedExport.cancel')}
        </Button>,
        <Button key="submit" type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
          {t('advancedExport.confirm')}
        </Button>,
      ]}
      width={480}
    >
      <div style={{ padding: 'var(--glass-padding-md, 24px) 0' }}>
        <p style={{ fontWeight: 500, marginBottom: 8 }}>{t('advancedExport.formatLabel')}</p>
        <Radio.Group
          className="advanced-export-format-group"
          aria-label={t('advancedExport.formatLabel')}
          value={format} 
          onChange={(e) => setFormat(e.target.value)}
          buttonStyle="solid"
        >
          <Radio.Button value="png"><FileImageOutlined /> PNG</Radio.Button>
          <Radio.Button value="jpg">JPG</Radio.Button>
          <Radio.Button value="svg">SVG</Radio.Button>
          <Radio.Button value="pdf"><FilePdfOutlined /> PDF</Radio.Button>
          <Radio.Button value="json"><CodeOutlined /> JSON</Radio.Button>
        </Radio.Group>

        <Divider style={{ margin: '16px 0' }} />

        <p style={{ fontWeight: 500, marginBottom: 8 }}>{t('advancedExport.dpiLabel')}</p>
        <Select
          className="advanced-export-dpi-select"
          aria-label={t('advancedExport.dpiLabel')}
          value={pixelRatio} 
          disabled={format === 'json' || format === 'svg'}
          onChange={setPixelRatio}
          style={{ width: '100%' }}
          options={[
            { label: t('advancedExport.dpi1x'), value: 1 },
            { label: t('advancedExport.dpi2x'), value: 2 },
            { label: t('advancedExport.dpi4x'), value: 4 },
          ]}
        />

        <Divider style={{ margin: '16px 0' }} />

        <div className="advanced-export-options">
          <Checkbox
            aria-label={t('advancedExport.includeBackground')}
            checked={includeBackground} 
            onChange={(e) => setIncludeBackground(e.target.checked)}
            disabled={format === 'pdf' || format === 'jpg'}
          >
            {t('advancedExport.includeBackground')}
          </Checkbox>
          <Checkbox
            aria-label={t('advancedExport.embedMetadata')}
            checked={embedMetadata} 
            onChange={(e) => setEmbedMetadata(e.target.checked)}
          >
            {t('advancedExport.embedMetadata')}
          </Checkbox>
        </div>

        <SvgExportPreview visible={visible && format === 'svg'} getReactFlowSnapshot={getReactFlowSnapshot} />

        <AdvancedExportModeNotice
          format={format}
          hasSnapshotProvider={Boolean(getReactFlowSnapshot)}
        />
      </div>
    </Modal>
  );
};
