import React, { useState } from 'react';
import { Modal, Button, Space, message, Alert } from 'antd';
import Editor from '@monaco-editor/react';
import { MermaidParser } from '@/services/import/MermaidParser';
import { useTranslation } from 'react-i18next';

interface MermaidImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (nodes: any[], edges: any[]) => void;
}

const DEFAULT_MERMAID = `graph TD
    User -->|Login| Gateway[API Gateway]
    Gateway --> AuthService[Auth Service]
    Gateway --> OrderService[Order Service]
    
    subgraph Storage
        OrderService --> DB[(Order DB)]
    end`;

export const MermaidImportModal: React.FC<MermaidImportModalProps> = ({ visible, onClose, onImport }) => {
  const { t } = useTranslation();
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
      message.success(`成功解析 ${nodes.length} 个节点和 ${edges.length} 条连线！`);
      onClose();
    } catch (err: any) {
      setError(err.message || '解析失败，请检查 Mermaid 语法。');
    }
  };

  return (
    <Modal
      title="从 Mermaid 导入"
      open={visible}
      onCancel={onClose}
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
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert 
          message="目前仅支持 Flowchart (graph/flowchart) 基础语法。导入后可手动微调布局。" 
          type="info" 
          showIcon 
        />
        
        {error && <Alert message={error} type="error" showIcon />}

        <div style={{ height: '400px', border: '1px solid #d9d9d9', borderRadius: '4px', overflow: 'hidden' }}>
          <Editor
            height="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={code}
            onChange={(val) => setCode(val || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </Space>
    </Modal>
  );
};
