import React, { useState } from 'react';
import { Modal, Radio, Checkbox, Select, Button, Space, message, Divider } from 'antd';
import { 
  DownloadOutlined, 
  CopyOutlined, 
  FileImageOutlined,
  FilePdfOutlined,
  CodeOutlined,
  CameraOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { downloadImage, copyImageToClipboard, ExportOptions } from '../../../utils/imageExporter';
import { useDiagramStore } from '../../../store/useDiagramStore';
import { appMessage } from '@/core/utils/antdStaticBridge';


interface AdvancedExportModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 高级导出模态框 (Phase 10)
 * 提供清晰度选择、背景控制、元数据注入及一键拷贝功能
 */
export const AdvancedExportModal: React.FC<AdvancedExportModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const { nodes } = useDiagramStore();
  const [format, setFormat] = useState<ExportOptions['format']>('png');
  const [pixelRatio, setPixelRatio] = useState<number>(2);
  const [includeBackground, setIncludeBackground] = useState<boolean>(true);
  const [embedMetadata, setEmbedMetadata] = useState<boolean>(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadImage(nodes as any[], {
        format,
        pixelRatio,
        includeBackground,
        embedMetadata
      });
      appMessage.success(t('advancedExport.successMsg', { format: format.toUpperCase() }));
      onClose();
    } catch (e) {
      appMessage.error(t('advancedExport.errorMsg'));
    } finally {
      setExporting(false);
    }
  };

  const handleCopyClipboard = async () => {
    const success = await copyImageToClipboard(nodes);
    if (success) {
      appMessage.success(t('advancedExport.copySuccess'));
      onClose();
    } else {
      appMessage.error(t('advancedExport.copyFailed'));
    }
  };

  return (
    <Modal
      title={<span><DownloadOutlined /> {t('advancedExport.title')}</span>}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyClipboard}>
          {t('advancedExport.copyClipboard')}
        </Button>,
        <Button key="cancel" onClick={onClose}>
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
          value={format} 
          onChange={(e) => setFormat(e.target.value)}
          buttonStyle="solid"
          style={{ width: '100%' }}
        >
          <Radio.Button value="png" style={{ width: '20%', textAlign: 'center' }}><FileImageOutlined /> PNG</Radio.Button>
          <Radio.Button value="jpg" style={{ width: '20%', textAlign: 'center' }}>JPG</Radio.Button>
          <Radio.Button value="svg" style={{ width: '20%', textAlign: 'center' }}>SVG</Radio.Button>
          <Radio.Button value="pdf" style={{ width: '20%', textAlign: 'center' }}><FilePdfOutlined /> PDF</Radio.Button>
          <Radio.Button value="json" style={{ width: '20%', textAlign: 'center' }}><CodeOutlined /> JSON</Radio.Button>
        </Radio.Group>

        <Divider style={{ margin: '16px 0' }} />

        <p style={{ fontWeight: 500, marginBottom: 8 }}>{t('advancedExport.dpiLabel')}</p>
        <Select 
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Checkbox 
            checked={includeBackground} 
            onChange={(e) => setIncludeBackground(e.target.checked)}
            disabled={format === 'pdf' || format === 'jpg'}
          >
            {t('advancedExport.includeBackground')}
          </Checkbox>
          <Checkbox 
            checked={embedMetadata} 
            onChange={(e) => setEmbedMetadata(e.target.checked)}
          >
            {t('advancedExport.embedMetadata')}
          </Checkbox>
        </div>

        <div style={{ marginTop: 20, padding: '12px', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 8, fontSize: '12px', color: '#666' }}>
          <Space>
            <CameraOutlined /> 
            <span>{t('advancedExport.svgHint')}</span>
          </Space>
        </div>
      </div>
    </Modal>
  );
};
