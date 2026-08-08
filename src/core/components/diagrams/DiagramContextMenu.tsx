import React, { useEffect, useRef } from 'react';
import { Menu, MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
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
import {
  focusFirstEnabledDiagramContextMenuItem,
  shouldCloseDiagramContextMenuFromKey,
} from './diagramContextMenuKeyboard';

export interface ContextMenuProps {
  top: number;
  left: number;
  submenuPlacement?: DiagramContextSubmenuPlacement;
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
import { hasMutationLockedNode, isNodeMutationLocked } from './nodeLockPolicy';
import type { DiagramContextSubmenuPlacement } from './diagramContextMenuPlacement';

const MULTI_SELECTION_ACTIONS = new Set([
  'duplicate',
  'lock',
  'unlock',
  'bringToFront',
  'sendToBack',
]);

export const DiagramContextMenu: React.FC<ContextMenuProps> = ({
  top,
  left,
  submenuPlacement = 'right',
  type,
  targetId,
  onClose,
  onAction,
  selectedNodes,
  selectedEdges,
  nodes,
  extraItems,
}) => {
  const { t } = useTranslation();
  const menuRootRef = useRef<HTMLDivElement>(null);
  const allNodes = nodes || selectedNodes;
  const targetNode = targetId ? allNodes.find(node => node.id === targetId) : undefined;
  const nodeActionTargets = type === 'edge' || type === 'pane'
    ? []
    : targetNode
      ? (selectedNodes.some(node => node.id === targetNode.id) ? selectedNodes : [targetNode])
      : selectedNodes;
  const hasLockedActionTarget = hasMutationLockedNode(nodeActionTargets);
  const allActionTargetsLocked = nodeActionTargets.length > 0
    && nodeActionTargets.every(isNodeMutationLocked);
  const submenuPlacements: NonNullable<MenuProps['builtinPlacements']> = {
    rightTop: {
      points: submenuPlacement === 'left' ? ['tr', 'tl'] : ['tl', 'tr'],
      offset: submenuPlacement === 'left' ? [-4, 0] : [4, 0],
      overflow: { adjustY: 1 },
    },
  };

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    focusFirstEnabledDiagramContextMenuItem(menuRootRef.current);

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const handleMenuClick = (info: { key: string }) => {
    const actionTargetId = type === 'multi-node' && MULTI_SELECTION_ACTIONS.has(info.key)
      ? undefined
      : targetId;
    onAction(info.key, actionTargetId);
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
          label: t('designer.contextMenu.cut'),
          disabled: type === 'edge' || hasLockedActionTarget
        },
        {
          key: 'copy',
          icon: <CopyOutlined />,
          label: t('designer.contextMenu.copy'),
          disabled: type === 'edge' || hasLockedActionTarget
        },
        {
          key: 'paste',
          icon: <SnippetsOutlined />,
          label: t('designer.contextMenu.paste'),
          disabled: !canPaste
        },
        {
          key: 'duplicate',
          icon: <CopyOutlined />,
          label: type === 'multi-node'
            ? t('designer.contextMenu.duplicateSelection')
            : t('designer.contextMenu.duplicate'),
          disabled: type === 'edge'
        },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: t('designer.contextMenu.delete'),
          danger: true,
          disabled: hasLockedActionTarget,
        }
      );

      items.push({ type: 'divider' });

      // Lock/Unlock - dynamic based on target node state
      if (type === 'node' || type === 'multi-node') {
        const isLocked = type === 'multi-node'
          ? allActionTargetsLocked
          : targetNode ? isNodeMutationLocked(targetNode) : false;
        items.push({
          key: isLocked ? 'unlock' : 'lock',
          icon: isLocked ? <UnlockOutlined /> : <LockOutlined />,
          label: type === 'multi-node'
            ? isLocked
              ? t('designer.contextMenu.unlockSelection')
              : t('designer.contextMenu.lockSelection')
            : isLocked
              ? t('designer.contextMenu.unlock')
              : t('designer.contextMenu.lock'),
        });

        // Container auto-layout
        const CONTAINER_TYPES = ['titleGroup', 'subGroup', 'swimlane', 'group'];
        if (targetNode && CONTAINER_TYPES.includes(targetNode.type || '')) {
          const isCollapsed = !!targetNode.data?.collapsed;
          items.push({
            key: 'autoLayoutContainer',
            icon: <AppstoreOutlined />,
            label: t('designer.contextMenu.autoLayoutContainer'),
            disabled: isLocked,
          });
          items.push({
            key: 'toggleCollapse',
            icon: isCollapsed ? <ExpandOutlined /> : <GroupOutlined />,
            label: isCollapsed
              ? t('designer.contextMenu.expandGroup')
              : t('designer.contextMenu.collapseGroup'),
            disabled: isLocked,
          });
          if (targetNode.type === 'titleGroup' || targetNode.type === 'subGroup') {
            items.push({
              key: 'ungroup',
              icon: <GroupOutlined rotate={180} />,
              label: t('designer.contextMenu.ungroup'),
              disabled: isLocked,
            });
          }
        }
      }

      // Edge-specific actions
      if (type === 'edge') {
        const targetEdge = selectedEdges.find(e => e.id === targetId);
        const hasWaypoints = Array.isArray(targetEdge?.data?.waypoints) && targetEdge.data.waypoints.length > 0;
        const isEditable = targetEdge?.type === 'editable';

        items.push(
          {
            key: 'reverseEdge',
            icon: <SwapOutlined />,
            label: t('designer.contextMenu.reverseDirection'),
          },
          {
            key: 'resetWaypoints',
            icon: <UndoOutlined />,
            label: t('designer.contextMenu.resetPath'),
            disabled: !hasWaypoints,
          }
        );

        if (!isEditable) {
          items.push({
            key: 'convertToEditable',
            icon: <EditOutlined />,
            label: t('designer.contextMenu.makeEditable'),
          });
        } else {
          items.push({
            key: 'stopEditing',
            icon: <CheckOutlined />,
            label: t('designer.contextMenu.stopEditing'),
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
          label: type === 'multi-node'
            ? t('designer.contextMenu.bringSelectionToFront')
            : t('designer.contextMenu.bringToFront'),
          disabled: hasLockedActionTarget,
        },
        {
          key: 'sendToBack',
          icon: <VerticalAlignBottomOutlined />,
          label: type === 'multi-node'
            ? t('designer.contextMenu.sendSelectionToBack')
            : t('designer.contextMenu.sendToBack'),
          disabled: hasLockedActionTarget,
        }
      );
    }

    // Alignment & Distribution (If multiple nodes selected)
    if (type === 'multi-node' || (type === 'selection' && selectedNodes.length > 1)) {
      items.push({ type: 'divider' });

      items.push({
        key: 'align-submenu',
        icon: <MdAlignHorizontalCenter />,
        label: t('designer.contextMenu.align'),
        popupClassName: 'diagram-context-menu-popup',
        disabled: hasLockedActionTarget,
        children: [
          { key: 'align:left', icon: <MdAlignHorizontalLeft />, label: t('designer.contextMenu.alignLeft') },
          { key: 'align:center', icon: <MdAlignHorizontalCenter />, label: t('designer.contextMenu.alignCenter') },
          { key: 'align:right', icon: <MdAlignHorizontalRight />, label: t('designer.contextMenu.alignRight') },
          { type: 'divider' as const },
          { key: 'align:top', icon: <MdAlignVerticalTop />, label: t('designer.contextMenu.alignTop') },
          { key: 'align:middle', icon: <MdAlignVerticalCenter />, label: t('designer.contextMenu.alignMiddle') },
          { key: 'align:bottom', icon: <MdAlignVerticalBottom />, label: t('designer.contextMenu.alignBottom') },
          ...(selectedNodes.length > 2 ? [
            { type: 'divider' as const },
            { key: 'distribute:horizontal', icon: <MdHorizontalDistribute />, label: t('designer.contextMenu.distributeHorizontal') },
            { key: 'distribute:vertical', icon: <MdVerticalDistribute />, label: t('designer.contextMenu.distributeVertical') },
          ] : []),
        ]
      });

      // Match Size
      items.push({
        key: 'match-submenu',
        icon: <FaRulerCombined />,
        label: t('designer.contextMenu.matchSize'),
        popupClassName: 'diagram-context-menu-popup',
        disabled: hasLockedActionTarget,
        children: [
          { key: 'matchWidth', icon: <ColumnWidthOutlined />, label: t('designer.contextMenu.matchWidth') },
          { key: 'matchHeight', icon: <ColumnHeightOutlined />, label: t('designer.contextMenu.matchHeight') },
          { key: 'matchSize', icon: <ExpandOutlined />, label: t('designer.contextMenu.matchBoth') },
        ]
      });

      // Grouping
      items.push({
        key: 'group',
        icon: <GroupOutlined />,
        label: t('designer.contextMenu.group'),
        disabled: hasLockedActionTarget,
      });
    }

    // Paste (Pane context)
    if (type === 'pane') {
      items.push({
        key: 'paste',
        icon: <SnippetsOutlined />,
        label: t('designer.contextMenu.paste'),
        disabled: !canPaste
      });

      items.push({
        key: 'selectAll',
        label: t('designer.contextMenu.selectAll')
      });

      items.push({ type: 'divider' });

      items.push(
        { key: 'undo', icon: <UndoOutlined />, label: t('designer.contextMenu.undo') },
        { key: 'redo', icon: <RedoOutlined />, label: t('designer.contextMenu.redo') }
      );

      items.push({ type: 'divider' });

      items.push(
        { key: 'fitView', icon: <ExpandOutlined />, label: t('designer.contextMenu.fitView') },
        {
          key: 'add-node-submenu',
          icon: <AppstoreOutlined />,
          label: t('designer.contextMenu.addNode'),
          popupClassName: 'diagram-context-menu-popup',
          children: [
            { key: 'context:add:flowchart:rect', icon: <EditOutlined />, label: t('designer.contextMenu.process') },
            { key: 'context:add:flowchart:database', icon: <ColumnWidthOutlined />, label: t('designer.contextMenu.database') },
            { key: 'context:add:flowchart:diamond', icon: <CheckOutlined />, label: t('designer.contextMenu.decision') },
            { key: 'context:add:flowchart:step', icon: <AppstoreOutlined />, label: t('designer.contextMenu.step') },
          ]
        },
        { key: 'zoomIn', icon: <ZoomInOutlined />, label: t('designer.contextMenu.zoomIn') },
        { key: 'zoomOut', icon: <ZoomOutOutlined />, label: t('designer.contextMenu.zoomOut') }
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
      ref={menuRootRef}
      style={{
        position: 'absolute',
        top,
        left,
        zIndex: 2100
      }}
      className="diagram-context-menu"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDownCapture={(event) => {
        if (!shouldCloseDiagramContextMenuFromKey(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <Menu
        mode="vertical"
        selectable={false}
        builtinPlacements={submenuPlacements}
        onClick={handleMenuClick}
        items={getMenuItems()}
        style={{ border: 'none' }}
      />
    </div>
  );
};
