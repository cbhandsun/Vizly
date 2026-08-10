import React, { useRef, useState } from 'react';
import { Modal, Button, Space, Alert } from 'antd';
import type { Edge, Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [code, setCode] = useState(DEFAULT_MERMAID);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInFlightRef = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const showImportError = (message: string) => {
    setError(message);
    queueMicrotask(() => editorRef.current?.focus());
  };

  const handleImport = async () => {
    if (importInFlightRef.current) return;

    let parsed: ReturnType<MermaidParser['parse']>;
    try {
      setError(null);
      const parser = MermaidParser.getInstance();
      parsed = parser.parse(code);
    } catch (error: unknown) {
      showImportError(
        error instanceof Error && error.message === 'Mermaid input is too large.'
          ? t('diagramViewer.mermaidImport.errors.tooLarge', 'Mermaid content is too large. Shorten it and try again.')
          : t('diagramViewer.mermaidImport.errors.parse', 'Could not parse the Mermaid syntax. Check the code and try again.'),
      );
      return;
    }

    if (parsed.nodes.length === 0) {
      showImportError(t(
        'diagramViewer.mermaidImport.errors.noNodes',
        'No valid nodes were found. Add a node or connection and try again.',
      ));
      return;
    }

    importInFlightRef.current = true;
    setImporting(true);
    try {
      const imported = await onImport(parsed.nodes, parsed.edges);
      if (!imported) {
        showImportError(t(
          'diagramViewer.mermaidImport.errors.apply',
          'Import did not finish, and the current canvas was not replaced. Check the canvas and try again.',
        ));
        return;
      }
      appMessage.success(t('diagramViewer.mermaidImport.success', {
        nodeCount: parsed.nodes.length,
        edgeCount: parsed.edges.length,
        defaultValue: 'Imported {{nodeCount}} nodes and {{edgeCount}} connections.',
      }));
      onClose();
    } catch (_error: unknown) {
      showImportError(t(
        'diagramViewer.mermaidImport.errors.apply',
        'Import did not finish, and the current canvas was not replaced. Check the canvas and try again.',
      ));
    } finally {
      importInFlightRef.current = false;
      setImporting(false);
    }
  };

  return (
    <Modal
      title={t('diagramViewer.mermaidImport.title', 'Import from Mermaid')}
      open={visible}
      rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} mermaid-import-modal`}
      zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}
      onCancel={() => {
        if (!importing) onClose();
      }}
      getContainer={getViewportOverlayContainer}
      closable={{
        'aria-label': t('diagramViewer.mermaidImport.close', 'Close Mermaid import'),
        disabled: importing,
      }}
      keyboard={!importing}
      mask={{ closable: !importing }}
      width={800}
      footer={[
        <Button key="back" aria-label={t('diagramViewer.mermaidImport.cancel', 'Cancel Mermaid import')} disabled={importing} onClick={onClose}>
          {t('common.cancel', 'Cancel')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          aria-label={t('diagramViewer.mermaidImport.submit', 'Parse Mermaid and create diagram')}
          disabled={!code.trim()}
          loading={importing}
          onClick={handleImport}
        >
          {t('diagramViewer.mermaidImport.submitLabel', 'Parse and create')}
        </Button>,
      ]}
    >
      <Space aria-busy={importing} orientation="vertical" style={{ width: '100%' }} size="middle">
        <Alert 
          title={t(
            'diagramViewer.mermaidImport.notice',
            'Basic Flowchart syntax (graph/flowchart) is supported. You can fine-tune the layout after import.',
          )}
          type="info" 
          showIcon 
          role="note"
        />
        
        {error && <Alert id="mermaid-import-error" title={error} type="error" showIcon role="alert" />}

        <div className="mermaid-import-modal__editor">
          <LazyMonacoEditor
            inputRef={editorRef}
            minHeight={0}
            ariaLabel={t('diagramViewer.mermaidImport.editorLabel', 'Mermaid code editor')}
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
