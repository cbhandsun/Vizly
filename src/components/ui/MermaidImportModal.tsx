import React, { useState } from 'react';
import { Modal, Button, Space, Alert } from 'antd';
import type { Edge, Node } from '@xyflow/react';
import { MermaidParser } from '@/services/import/MermaidParser';
import { appMessage } from '@/core/utils/antdStaticBridge';
import LazyMonacoEditor from '@/core/components/lazy/LazyMonacoEditor';
import './MermaidImportModal.css';


interface MermaidImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (nodes: Node[], edges: Edge[]) => void;
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

  const handleImport = () => {
    try {
      setError(null);
      const parser = MermaidParser.getInstance();
      const { nodes, edges } = parser.parse(code);
      
      if (nodes.length === 0) {
        throw new Error('未能从代码中提取到有效的节点，请检查语法。');
      }

      onImport(nodes, edges);
      appMessage.success(`成功解析 ${nodes.length} 个节点和 ${edges.length} 条连线！`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message
        ? err.message
        : '解析失败，请检查 Mermaid 语法。');
    }
  };

  return (
    <Modal
      title="从 Mermaid 导入"
      open={visible}
      rootClassName="mermaid-import-modal"
      onCancel={onClose}
      getContainer={() => document.getElementById('app-root-layout') || document.body}
      width={800}
      footer={[
        <Button key="back" onClick={onClose}>
          取消
        </Button>,
        <Button key="submit" type="primary" onClick={handleImport}>
          解析并生成
        </Button>,
      ]}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
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
            }}
          />
        </div>
      </Space>
    </Modal>
  );
};
