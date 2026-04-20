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
import { downloadImage, copyImageToClipboard, ExportOptions } from '../../../utils/imageExporter';
import { useDiagramStore } from '../../../store/useDiagramStore';

interface AdvancedExportModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 高级导出模态框 (Phase 10)
 * 提供清晰度选择、背景控制、元数据注入及一键拷贝功能
 */
export const AdvancedExportModal: React.FC<AdvancedExportModalProps> = ({ visible, onClose }) => {
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
      message.success(`成功导出 ${format.toUpperCase()}`);
      onClose();
    } catch (e) {
      message.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyClipboard = async () => {
    const success = await copyImageToClipboard(nodes);
    if (success) {
      message.success('已复制到剪贴板，可直接在飞书/钉钉等粘贴');
      onClose();
    } else {
      message.error('复制失败');
    }
  };

  return (
    <Modal
      title={<span><DownloadOutlined /> 高级图表导出</span>}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyClipboard}>
          拷贝到剪贴板
        </Button>,
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="submit" type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
          确认导出
        </Button>,
      ]}
      width={480}
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ fontWeight: 500, marginBottom: 8 }}>选择导出格式</p>
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

        <p style={{ fontWeight: 500, marginBottom: 8 }}>图片清晰度 (DPI)</p>
        <Select 
          value={pixelRatio} 
          disabled={format === 'json' || format === 'svg'}
          onChange={setPixelRatio}
          style={{ width: '100%' }}
          options={[
            { label: '1x - 标准 (Standard)', value: 1 },
            { label: '2x - 适配 Retina (Recommended)', value: 2 },
            { label: '4x - 印刷级超清 (Ultra High Definition)', value: 4 },
          ]}
        />

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Checkbox 
            checked={includeBackground} 
            onChange={(e) => setIncludeBackground(e.target.checked)}
            disabled={format === 'pdf' || format === 'jpg'}
          >
            包含底色背景 (透明背景建议使用 PNG)
          </Checkbox>
          <Checkbox 
            checked={embedMetadata} 
            onChange={(e) => setEmbedMetadata(e.target.checked)}
          >
            注入元数据 (支持图片拖入 Vizly 自动恢复编辑)
          </Checkbox>
        </div>

        <div style={{ marginTop: 20, padding: '12px', background: '#f5f5f5', borderRadius: 8, fontSize: '12px', color: '#666' }}>
          <Space>
            <CameraOutlined /> 
            <span>提示：SVG 格式支持无限放大且不失真，适合在 PPT 或专业设计软件中使用。</span>
          </Space>
        </div>
      </div>
    </Modal>
  );
};
