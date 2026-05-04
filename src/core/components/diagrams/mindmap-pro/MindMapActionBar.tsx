import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactFlow, Node, Edge, useStore } from '@xyflow/react';
import { Popover } from 'antd';
import { 
  SisternodeOutlined, 
  SubnodeOutlined, 
  BlockOutlined, 
  LinkOutlined, 
  FormatPainterOutlined,
  CopyOutlined,
  FileMarkdownOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { MindMapBeautifyPanel } from './MindMapBeautifyPanel';
import { exportMindMapToMarkdown } from '../hooks/useMindMapOrchestrator';
import {
  ToolbarContainer,
  ToolbarButton,
  ToolbarDivider,
} from '../../shared/FloatingToolbar';

export const MindMapActionBar: React.FC = () => {
  const { t } = useTranslation();
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();

  // Create mock context to pass to Beautify panel without needing the global plugin context
  // updateNodesBatch(ids, partialData): partialData is merged into node.data for ALL ids
  const mockCtx = useMemo(() => {
      return {
          getNodes,
          getEdges,
          updateNodesBatch: (ids: string[], partialData: any) => {
              setNodes((nds) => nds.map(n =>
                  ids.includes(n.id)
                      ? { ...n, data: { ...n.data, ...partialData } }
                      : n
              ));
          }
      } as any;
  }, [getNodes, getEdges, setNodes]);
  
  // [O-1] Use useStore selectors — subscribe only to selection changes
  const selectedNodeIds = useStore(s => s.nodes.filter(n => n.selected).map(n => n.id).join(','));
  const selectedNodes = useMemo(() => {
    if (!selectedNodeIds) return [];
    const ids = selectedNodeIds.split(',');
    return getNodes().filter(n => ids.includes(n.id));
  }, [selectedNodeIds, getNodes]);

  const selectedEdgeIds = useStore(s => s.edges.filter(e => e.selected).map(e => e.id).join(','));
  const selectedEdges = useMemo(() => {
    if (!selectedEdgeIds) return [];
    const ids = selectedEdgeIds.split(',');
    return getEdges().filter(e => ids.includes(e.id));
  }, [selectedEdgeIds, getEdges]);

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
      handleAddChild();
      return;
    }
    
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

  // [T-1] Copy branch — dispatches Ctrl+C keyboard event
  const handleCopyBranch = useCallback(() => {
      if (!selectedNode) return;
      window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'c', ctrlKey: true, bubbles: true, cancelable: true
      }));
  }, [selectedNode]);

  // [T-2] Export Markdown
  const handleExportMd = useCallback(() => {
      const nodes = getNodes();
      const edges = getEdges();
      const md = exportMindMapToMarkdown(nodes, edges);
      if (!md) return;
      const rootLabel = nodes.find(n => n.type === 'mindmap' && n.data?.depth === 0)?.data?.label as string || 'mindmap';
      const safeFilename = rootLabel.replace(/[^a-zA-Z0-9一-龥]/g, '_').substring(0, 40);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${safeFilename}.md`; a.click();
      URL.revokeObjectURL(url);
  }, [getNodes, getEdges]);

  // Delete selected node(s) — route through smart-delete to get takeSnapshot + child-grafting
  const handleDeleteNode = useCallback(() => {
    if (selectedNodes.length === 0) return;

    // Filter out root nodes (depth-0 cannot be deleted)
    const deletableIds = selectedNodes
      .filter(n => {
        // Robust root detection: depth===0 OR (depth undefined AND has direction prop)
        const d = n.data?.depth as number | undefined;
        const isRoot = d === 0 || (d === undefined && n.data?.direction !== undefined);
        return !isRoot;
      })
      .map(n => n.id);

    if (deletableIds.length === 0) return;

    // Use smart-delete which handles takeSnapshot + child re-grafting
    window.dispatchEvent(new CustomEvent('mindmap:smart-delete', {
      detail: { nodeIds: deletableIds }
    }));
  }, [selectedNodes]);

  if (selectedNodes.length === 0) {
    return null;
  }

  // Robust root detection: depth===0 OR (depth undefined AND has 'direction' prop — root-only)
  const nodeDepth = selectedNode?.data?.depth as number | undefined;
  const isRoot = nodeDepth === 0 || (nodeDepth === undefined && selectedNode?.data?.direction !== undefined);

  const BoundaryIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="12" rx="2" strokeDasharray="3 2" />
    </svg>
  );

  return (
    <ToolbarContainer>
      {/* 结构操作区 */}
      <ToolbarButton
        icon={<SisternodeOutlined />}
        label={t('plugins.mindmap.actionBar.addSibling')}
        disabled={!selectedNode}
        onClick={handleAddSibling}
      />
      <ToolbarButton
        icon={<SubnodeOutlined />}
        label={t('plugins.mindmap.actionBar.addChild')}
        disabled={!selectedNode}
        onClick={handleAddChild}
      />

      <ToolbarDivider />

      <ToolbarButton
        icon={<LinkOutlined />}
        label={t('plugins.mindmap.actionBar.addRelationship')}
        onClick={handleAddRelationship}
      />
      <ToolbarButton
        icon={<BlockOutlined />}
        label={t('plugins.mindmap.actionBar.addSummary')}
        disabled={selectedNodes.length === 0}
        onClick={handleAddSummary}
      />
      <ToolbarButton
        icon={<BoundaryIcon />}
        label={t('plugins.mindmap.actionBar.addBoundary')}
        disabled={!selectedNode}
        onClick={() => {
          const event = new CustomEvent('editor:add-boundary-node', {
            detail: { nodeId: selectedNode?.id }
          });
          window.dispatchEvent(event);
        }}
      />

      <ToolbarDivider />

      {/* 编辑操作区 */}
      <ToolbarButton
        icon={<CopyOutlined />}
        label={t('plugins.mindmap.actionBar.copyBranch')}
        disabled={!selectedNode}
        onClick={handleCopyBranch}
      />
      <ToolbarButton
        icon={<FileMarkdownOutlined />}
        label={t('plugins.mindmap.actionBar.exportMd')}
        onClick={handleExportMd}
      />

      <ToolbarDivider />

      {/* 美化 */}
      <Popover 
          content={<MindMapBeautifyPanel ctx={mockCtx} selectedNodes={selectedNodes} selectedEdges={selectedEdges} />} 
          trigger="click" 
          placement="bottom"
          styles={{ root: {}, container: { padding: 0 } }}
      >
          <span>
            <ToolbarButton icon={<FormatPainterOutlined />} label={t('plugins.mindmap.actionBar.beautify')} />
          </span>
      </Popover>

      {/* 危险操作区 — 删除（根节点不可删）*/}
      {!isRoot && (
        <>
          <ToolbarDivider />
          <ToolbarButton
            icon={<DeleteOutlined />}
            label={t('plugins.mindmap.actions.deleteNode')}
            danger
            onClick={handleDeleteNode}
          />
        </>
      )}
    </ToolbarContainer>
  );
};
