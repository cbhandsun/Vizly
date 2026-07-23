import React from 'react';
import { Menu, MenuProps } from 'antd';
import {
  DeleteOutlined,
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  GroupOutlined,
  LockOutlined,
  UnlockOutlined,
  SwapOutlined,
  UndoOutlined,
  EditOutlined,
  CheckOutlined,
  AppstoreOutlined,
  ColumnWidthOutlined,
  ColumnHeightOutlined,
  ExpandOutlined,
  RedoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import {
  MdAlignHorizontalLeft, MdAlignHorizontalCenter, MdAlignHorizontalRight,
  MdAlignVerticalTop, MdAlignVerticalCenter, MdAlignVerticalBottom,
  MdHorizontalDistribute, MdVerticalDistribute
} from 'react-icons/md';
import { FaRulerCombined } from 'react-icons/fa';
import { Node, Edge } from '@xyflow/react';
import { logDiagramContextMenuFailure } from './diagramContextMenuLogging';

export interface ContextMenuProps {
  top: number;
  left: number;
  right?: number;
  bottom?: number;
  type: 'node' | 'edge' | 'pane' | 'selection' | 'multi-node';
  targetId?: string;
  onClose: () => void;
  onAction: (action: string, targetId?: string) => void;
  selectedNodes: Node[];
  selectedEdges: Edge[];
  nodes?: Node[];  // All nodes for lock state lookup
  extraItems?: MenuProps['items'];
}

import './DiagramContextMenu.css';

export const DiagramContextMenu: React.FC<ContextMenuProps> = ({
  top,
  left,
  type,
  targetId,
  onClose,
  onAction,
  selectedNodes,
  selectedEdges,
  nodes,
  extraItems,
}) => {
  const handleMenuClick = (info: { key: string }) => {
    onAction(info.key, targetId);
    onClose();
  };

  const getMenuItems = (): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    const canPaste = (() => {
      try {
        return !!localStorage.getItem('flowchart-clipboard');
      } catch (error) {
        logDiagramContextMenuFailure('checkClipboardAvailability', error);
        return false;
      }
    })();

    // Selection/Node/Edge Actions
    if (type === 'node' || type === 'edge' || type === 'selection' || type === 'multi-node') {
      items.push(
        {
          key: 'cut',
          icon: <ScissorOutlined />,
          label: '剪切 (Cut)',
          disabled: type === 'edge'
        },
        {
          key: 'copy',
          icon: <CopyOutlined />,
          label: '复制 (Copy)',
          disabled: type === 'edge'
        },
        {
          key: 'paste',
          icon: <SnippetsOutlined />,
          label: '粘贴 (Paste)',
          disabled: !canPaste
        },
        {
          key: 'duplicate',
          icon: <CopyOutlined />,
          label: '创建副本 (Duplicate)',
          disabled: type === 'edge'
        },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '删除 (Delete)',
          danger: true
        }
      );

      items.push({ type: 'divider' });

      // Lock/Unlock - dynamic based on target node state
      if (type === 'node' || type === 'multi-node') {
        const allNodes = nodes || selectedNodes;
        const targetNode = allNodes.find(n => n.id === targetId);
        const isLocked = targetNode?.data?.locked === true;
        items.push({
          key: isLocked ? 'unlock' : 'lock',
          icon: isLocked ? <UnlockOutlined /> : <LockOutlined />,
          label: isLocked ? '解锁 (Unlock)' : '锁定 (Lock)',
        });

        // Container auto-layout
        const CONTAINER_TYPES = ['titleGroup', 'subGroup', 'swimlane', 'group'];
        if (targetNode && CONTAINER_TYPES.includes(targetNode.type || '')) {
          const isCollapsed = !!targetNode.data?.collapsed;
          items.push({
            key: 'autoLayoutContainer',
            icon: <AppstoreOutlined />,
            label: '自动布局子节点 (Auto Layout)',
          });
          items.push({
            key: 'toggleCollapse',
            icon: isCollapsed ? <ExpandOutlined /> : <GroupOutlined />,
            label: isCollapsed ? '展开组 (Expand Group)' : '折叠组 (Collapse Group)',
          });
        }
      }

      // Edge-specific actions
      if (type === 'edge') {
        const targetEdge = selectedEdges.find(e => e.id === targetId);
        const hasWaypoints = targetEdge?.data?.waypoints && (targetEdge.data.waypoints as any[]).length > 0;
        const isEditable = targetEdge?.type === 'editable';

        items.push(
          {
            key: 'reverseEdge',
            icon: <SwapOutlined />,
            label: '反转方向 (Reverse Direction)',
          },
          {
            key: 'resetWaypoints',
            icon: <UndoOutlined />,
            label: '重置路径 (Reset Path)',
            disabled: !hasWaypoints,
          }
        );

        if (!isEditable) {
          items.push({
            key: 'convertToEditable',
            icon: <EditOutlined />,
            label: '转为可编辑 (Make Editable)',
          });
        } else {
          items.push({
            key: 'stopEditing',
            icon: <CheckOutlined />,
            label: '退出编辑状态 (Stop Editing)',
          });
        }
      }
    }

    // Z-Index / Layering (Only for nodes)
    if (type === 'node' || type === 'multi-node' || (type === 'selection' && selectedNodes.length > 0)) {
      items.push(
        {
          key: 'bringToFront',
          icon: <VerticalAlignTopOutlined />,
          label: '置于顶层 (Bring to Front)'
        },
        {
          key: 'sendToBack',
          icon: <VerticalAlignBottomOutlined />,
          label: '置于底层 (Send to Back)'
        }
      );
    }

    // Alignment & Distribution (If multiple nodes selected)
    if (type === 'multi-node' || (type === 'selection' && selectedNodes.length > 1)) {
      items.push({ type: 'divider' });

      items.push({
        key: 'align-submenu',
        icon: <MdAlignHorizontalCenter />,
        label: '对齐 (Align)',
        children: [
          { key: 'align:left', icon: <MdAlignHorizontalLeft />, label: '左对齐' },
          { key: 'align:center', icon: <MdAlignHorizontalCenter />, label: '水平居中' },
          { key: 'align:right', icon: <MdAlignHorizontalRight />, label: '右对齐' },
          { type: 'divider' as const },
          { key: 'align:top', icon: <MdAlignVerticalTop />, label: '顶部对齐' },
          { key: 'align:middle', icon: <MdAlignVerticalCenter />, label: '垂直居中' },
          { key: 'align:bottom', icon: <MdAlignVerticalBottom />, label: '底部对齐' },
          ...(selectedNodes.length > 2 ? [
            { type: 'divider' as const },
            { key: 'distribute:horizontal', icon: <MdHorizontalDistribute />, label: '水平均匀分布' },
            { key: 'distribute:vertical', icon: <MdVerticalDistribute />, label: '垂直均匀分布' },
          ] : []),
        ]
      });

      // Match Size
      items.push({
        key: 'match-submenu',
        icon: <FaRulerCombined />,
        label: '统一尺寸 (Match Size)',
        children: [
          { key: 'matchWidth', icon: <ColumnWidthOutlined />, label: '统一宽度' },
          { key: 'matchHeight', icon: <ColumnHeightOutlined />, label: '统一高度' },
          { key: 'matchSize', icon: <ExpandOutlined />, label: '统一大小' },
        ]
      });

      // Grouping
      items.push({
        key: 'group',
        icon: <GroupOutlined />,
        label: '成组 (Group)'
      });
    }

    // Paste (Pane context)
    if (type === 'pane') {
      items.push({
        key: 'paste',
        icon: <SnippetsOutlined />,
        label: '粘贴 (Paste)',
        disabled: !canPaste
      });

      items.push({
        key: 'selectAll',
        label: '全选 (Select All)'
      });

      items.push({ type: 'divider' });

      items.push(
        { key: 'undo', icon: <UndoOutlined />, label: '撤销 (Undo)' },
        { key: 'redo', icon: <RedoOutlined />, label: '重做 (Redo)' }
      );

      items.push({ type: 'divider' });

      items.push(
        { key: 'fitView', icon: <ExpandOutlined />, label: '适应屏幕 (Fit View)' },
        {
          key: 'add-node-submenu',
          icon: <AppstoreOutlined />,
          label: '添加节点 (Add Node)',
          children: [
            { key: 'context:add:flowchart:rect', icon: <EditOutlined />, label: '过程 (Process)' },
            { key: 'context:add:flowchart:database', icon: <ColumnWidthOutlined />, label: '数据库 (Database)' },
            { key: 'context:add:flowchart:diamond', icon: <CheckOutlined />, label: '判定 (Decision)' },
            { key: 'context:add:flowchart:step', icon: <AppstoreOutlined />, label: '步骤 (Step)' },
          ]
        },
        { key: 'zoomIn', icon: <ZoomInOutlined />, label: '放大 (Zoom In)' },
        { key: 'zoomOut', icon: <ZoomOutOutlined />, label: '缩小 (Zoom Out)' }
      );
    }

    if (extraItems && extraItems.length > 0) {
      items.push({ type: 'divider' as const });
      items.push(...extraItems);
    }

    return items;
  };

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        zIndex: 2100
      }}
      className="diagram-context-menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Menu
        mode="vertical"
        selectable={false}
        onClick={handleMenuClick}
        items={getMenuItems()}
        style={{ border: 'none' }}
      />
    </div>
  );
};
