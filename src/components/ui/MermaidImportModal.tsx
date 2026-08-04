import React, { useRef, useState } from 'react';
import { Modal, Button, Space, Alert } from 'antd';
import type { Edge, Node } from '@xyflow/react';
import { MermaidParser } from '@/services/import/MermaidParser';
import { appMessage } from '@/core/utils/antdStaticBridge';
import LazyMonacoEditor from '@/core/components/lazy/LazyMonacoEditor';
import {
  COMMERCIAL_VIEWPORT_MODAL_CLASS,
  COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
  getViewportOverlayContainer,
} from '@/core/components/ui/viewportOverlayPortal';
import './MermaidImportModal.css';


interface MermaidImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (nodes: Node[], edges: Edge[]) => Promise<boolean>;
}

const DEFAULT_MERMAID = `graph TD
    User -->|Login| Gateway[API Gateway]
    Gateway --> AuthService[Auth Service]
    Gateway --> OrderService[Order Service]
    
    subgraph Storage
        OrderService --> DB[(Order DB)]
    end`;

export const MermaidImportModal: React.FC<MermaidImportModalProps> = ({ visible, onClose, onImport }) => {
  const [code, setCode] = useState(DEFAULT_MERMAID);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInFlightRef = useRef(false);

  const handleImport = async () => {
    if (importInFlightRef.current) return;

    let parsed: ReturnType<MermaidParser['parse']>;
    try {
      setError(null);
      const parser = MermaidParser.getInstance();
      parsed = parser.parse(code);
    } catch (error: unknown) {
      setError(
        error instanceof Error && error.message === 'Mermaid input is too large.'
          ? 'Mermaid 内容过大，请缩减后重试。'
          : '解析失败，请检查 Mermaid 语法。',
      );
      return;
    }

    if (parsed.nodes.length === 0) {
      setError('未能从代码中提取到有效节点，请补充节点或连线后重试。');
      return;
    }

    importInFlightRef.current = true;
    setImporting(true);
    try {
      const imported = await onImport(parsed.nodes, parsed.edges);
      if (!imported) {
        setError('导入未完成，当前画布未被替换。请检查画布状态后重试。');
        return;
      }
      appMessage.success(`成功导入 ${parsed.nodes.length} 个节点和 ${parsed.edges.length} 条连线！`);
      onClose();
    } catch (_error: unknown) {
      setError('导入未完成，当前画布未被替换。请检查画布状态后重试。');
    } finally {
      importInFlightRef.current = false;
      setImporting(false);
    }
  };

  return (
    <Modal
      title="从 Mermaid 导入"
      open={visible}
      rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} mermaid-import-modal`}
      zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}
      onCancel={() => {
        if (!importing) onClose();
      }}
      getContainer={getViewportOverlayContainer}
      closable={{
        'aria-label': '关闭 Mermaid 导入',
        disabled: importing,
      }}
      keyboard={!importing}
      mask={{ closable: !importing }}
      width={800}
      footer={[
        <Button key="back" aria-label="取消 Mermaid 导入" disabled={importing} onClick={onClose}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          aria-label="解析 Mermaid 并生成"
          disabled={!code.trim()}
          loading={importing}
          onClick={handleImport}
        >
          解析并生成
        </Button>,
      ]}
    >
      <Space aria-busy={importing} orientation="vertical" style={{ width: '100%' }} size="middle">
        <Alert 
          title="目前仅支持 Flowchart (graph/flowchart) 基础语法。导入后可手动微调布局。"
          type="info" 
          showIcon 
        />
        
        {error && <Alert id="mermaid-import-error" title={error} type="error" showIcon role="alert" />}

        <div style={{ height: '400px', border: '1px solid #d9d9d9', borderRadius: '4px', overflow: 'hidden' }}>
          <LazyMonacoEditor
            ariaLabel="Mermaid 基础编辑器"
            ariaInvalid={Boolean(error)}
            ariaDescribedBy={error ? 'mermaid-import-error' : undefined}
            value={code}
            onChange={(val) => {
              setError(null);
              setCode(val || '');
            }}
            language="markdown"
            options={{
              minimap: { enabled: false },
              readOnly: importing,
            }}
          />
        </div>
      </Space>
    </Modal>
  );
};
