import React, { useMemo } from 'react';
import { useReactFlow, Node, Edge } from '@xyflow/react';
import { Popover, Divider } from 'antd';
import { 
  SisternodeOutlined, 
  SubnodeOutlined, 
  BlockOutlined, 
  LinkOutlined, 
  FormatPainterOutlined,
} from '@ant-design/icons';
import { MindMapBeautifyPanel } from './MindMapBeautifyPanel';

interface ActionBtnProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

const ActionBtn: React.FC<ActionBtnProps> = ({ icon, label, onClick, disabled }) => {
  return (
    <div 
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        gap: 4,
        padding: '8px 10px', 
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: '#555', 
        fontSize: 12, 
        borderRadius: 8,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#f0f2f5'; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <div style={{ fontSize: 18, color: disabled ? '#aaa' : '#333' }}>{icon}</div>
      <div style={{ whiteSpace: 'nowrap', transform: 'scale(0.9)', transformOrigin: 'top' }}>{label}</div>
    </div>
  );
};

export const MindMapActionBar: React.FC = () => {
  const { getNodes, getEdges, setNodes } = useReactFlow();

  // Create mock context to pass to Beautify panel without needing the global plugin context
  const mockCtx = useMemo(() => {
      // Create a mocked PluginContext object containing only the necessary parts needed by the panel
      return {
          getNodes,
          getEdges,
          updateNodesBatch: (ids: string[], updates: any) => {
              setNodes((nds) => nds.map(n => ids.includes(n.id) ? { ...n, data: { ...n.data, ...updates[n.id] } } : n));
          }
      } as any;
  }, [getNodes, getEdges, setNodes]);
  
  // Real-time getters
  const selectedNodes = getNodes().filter(n => n.selected);
  const selectedEdges = getEdges().filter(e => e.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

  const handleAddChild = () => {
    if (!selectedNode) return;
    const event = new CustomEvent('mindmap:quickadd', {
      detail: {
        parentId: selectedNode.id,
        direction: selectedNode.data?.direction ?? 'LR',
        depth: (selectedNode.data?.depth as number) ?? 0
      }
    });
    window.dispatchEvent(event);
  };

  const handleAddSibling = () => {
    if (!selectedNode) return;
    const depth = (selectedNode.data?.depth as number) ?? 0;
    if (depth === 0) {
      // Root selected, act like Add Child
      handleAddChild();
      return;
    }
    
    // Find parent edge
    const edges = getEdges();
    const parentEdge = edges.find(edge => edge.target === selectedNode.id && edge.type !== 'relationshipEdge');
    if (parentEdge) {
      const parentNode = getNodes().find(n => n.id === parentEdge.source);
      if (parentNode) {
        const event = new CustomEvent('mindmap:quickadd', {
          detail: {
            parentId: parentNode.id,
            direction: parentNode.data?.direction ?? 'LR',
            depth: parentNode.data?.depth ?? 0
          }
        });
        window.dispatchEvent(event);
      }
    }
  };

  const handleAddSummary = () => {
    if (selectedNodes.length === 0) return;
    const event = new CustomEvent('editor:add-summary-node', {
      detail: {
        sourceIds: selectedNodes.map(n => n.id)
      }
    });
    window.dispatchEvent(event);
  };

  const handleAddRelationship = () => {
      const event = new CustomEvent('editor:create-relationship-edge', {
          detail: { sourceId: selectedNode?.id }
      });
      window.dispatchEvent(event);
  };

  // Do not render anything if nothing is selected or if we are not a mindmap branch
  // We rely on NodeToolbar to mount this anyway, but just in case:
  if (selectedNodes.length === 0) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '2px 6px',
      background: 'rgba(255, 255, 255, 0.70)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderRadius: 24,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.4) inset, 0 0 0 1px rgba(0, 0, 0, 0.05)',
      pointerEvents: 'all',
      border: 'none',
      transition: 'left 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), top 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
      animation: 'toolbarFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {/* 结构操作 */}
      <ActionBtn icon={<SisternodeOutlined />} label="同级主题" disabled={!selectedNode} onClick={handleAddSibling} />
      <ActionBtn icon={<SubnodeOutlined />} label="子主题" disabled={!selectedNode} onClick={handleAddChild} />
      <ActionBtn icon={<LinkOutlined />} label="联系线" onClick={handleAddRelationship} />
      <ActionBtn icon={<BlockOutlined />} label="概括总结" disabled={selectedNodes.length === 0} onClick={handleAddSummary} />

      <Divider orientation="vertical" style={{ height: 32 }} />

      {/* 美化 */}
      <Popover 
          content={<MindMapBeautifyPanel ctx={mockCtx} selectedNodes={selectedNodes} selectedEdges={selectedEdges} />} 
          trigger="click" 
          placement="bottom"
          styles={{ root: {}, container: { padding: 0 } }}
      >
          <div>
            <ActionBtn icon={<FormatPainterOutlined />} label="美化" />
          </div>
      </Popover>

    </div>
  );
};
