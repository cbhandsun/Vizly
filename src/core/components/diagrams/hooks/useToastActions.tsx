import React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Node, Edge } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import type { DiagramActionTarget } from './useDiagramActions';
import type { ClipboardPasteResult } from './useClipboard';
import { hasMutationLockedNode, resolveTargetNodes } from '../nodeLockPolicy';

/**
 * 🚀 P2 性能优化：从 FlowchartDesigner 提取的 Toast 包装层
 * 
 * 将所有 *WithToast 回调集中管理，减少主组件的 hook 链长度和 reconciliation 开销。
 */

interface UseToastActionsProps {
    messageApi: MessageInstance;
    notificationApi: NotificationInstance;
    // Core actions (from useDiagramActions)
    handleDelete: (target?: DiagramActionTarget) => void;
    handleDuplicate: (target?: DiagramActionTarget) => void;
    // Clipboard actions
    handleCopy: () => void;
    handlePaste: () => Promise<ClipboardPasteResult>;
    handleCut: () => void;
    // Group actions
    handleGroup: () => void;
    handleUngroup: (targetNodeIds?: string[]) => void;
    // Context menu action
    onContextMenuAction: (action: string, targetId?: string) => void;
    // History
    undo: () => void;
    // State refs (avoid unstable deps)
    selectedNodes: Node[];
    selectedEdges: Edge[];
    nodesRef: React.RefObject<Node[]>;
    edgesRef: React.RefObject<Edge[]>;
}

export function useToastActions({
    messageApi,
    notificationApi: _notificationApi,
    handleDelete,
    handleDuplicate,
    handleCopy,
    handlePaste,
    handleCut,
    handleGroup,
    handleUngroup,
    onContextMenuAction,
    undo,
    selectedNodes,
    selectedEdges,
    nodesRef,
    edgesRef,
}: UseToastActionsProps) {
    const { t } = useTranslation();

    // --- showUndoableMessage ---
    // P3 UX Optimization: Replaced intrusive Notification with an inline Message action
    const showUndoableMessage = useCallback((actionMsg: string) => {
        const key = `flowchart.undo.${Date.now()}`;
        messageApi.open({
            key,
            type: 'success',
            content: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {actionMsg}
                    <a 
                        onClick={() => {
                            undo();
                            messageApi.destroy(key);
                        }} 
                        style={{ fontWeight: 600, textDecoration: 'underline' }}
                    >
                        {t('designer.flowchart.undo.action', '撤销')}
                    </a>
                </span>
            ),
            duration: 3,
        });
    }, [messageApi, t, undo]);

    // --- Copy / Paste / Cut ---
    // 📋 Copy 操作静默执行（行业标准：Figma/Miro 的 Ctrl+C 不弹 toast）
    const handleCopyWithToast = useCallback(() => {
        if (selectedNodes.length === 0) {
            return; // 无选中 → 静默忽略
        }
        handleCopy();
    }, [handleCopy, selectedNodes.length]);

    const handlePasteWithToast = useCallback(async () => {
        const result = await handlePaste();
        if (result === 'scope-changed') {
            messageApi.warning(t(
                'designer.flowchart.toast.pasteScopeChanged',
                '页面或图表已切换，粘贴已取消，请重试',
            ));
            return;
        }
        if (result === 'empty') {
            messageApi.info(t('designer.flowchart.toast.nothingToPaste'));
        }
    }, [handlePaste, messageApi, t]);

    const handleCutWithToast = useCallback(() => {
        if (selectedNodes.length === 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToCut'));
            return;
        }
        if (hasMutationLockedNode(selectedNodes)) {
            messageApi.warning(t('designer.flowchart.toast.lockedSelection', '节点已锁定，请先解锁后再操作'));
            return;
        }
        handleCut();
    }, [handleCut, messageApi, selectedNodes, t]);

    // --- Delete / Duplicate ---
    const getDeleteCounts = useCallback((target?: DiagramActionTarget) => {
        if (!target) {
            return { nodes: selectedNodes.length, edges: selectedEdges.length };
        }
        if (Array.isArray(target)) {
            const targetIds = new Set(target);
            return {
                nodes: nodesRef.current.filter(node => targetIds.has(node.id)).length,
                edges: edgesRef.current.filter(edge => targetIds.has(edge.id)).length,
            };
        }
        const isNode = nodesRef.current.some(n => n.id === target);
        const isEdge = edgesRef.current.some(e => e.id === target);
        if (isNode) {
            if (selectedNodes.some(n => n.id === target)) {
                return { nodes: selectedNodes.length, edges: selectedEdges.length };
            }
            return { nodes: 1, edges: 0 };
        }
        if (isEdge) return { nodes: 0, edges: 1 };
        return { nodes: 0, edges: 0 };
    }, [selectedEdges, selectedNodes, nodesRef, edgesRef]);

    const handleDeleteWithToast = useCallback((target?: DiagramActionTarget) => {
        const counts = getDeleteCounts(target);
        if (counts.nodes + counts.edges === 0) return;
        const targetIds = target
            ? new Set(typeof target === 'string' ? [target] : target)
            : null;
        const targetNodes = targetIds
            ? nodesRef.current.filter(node => targetIds.has(node.id))
            : selectedNodes;
        const deletionNodes = typeof target === 'string' && selectedNodes.some(node => node.id === target)
            ? selectedNodes
            : targetNodes;
        if (hasMutationLockedNode(deletionNodes)) {
            messageApi.warning(t('designer.flowchart.toast.lockedSelection', '节点已锁定，请先解锁后再操作'));
            return;
        }
        handleDelete(target);
    }, [getDeleteCounts, handleDelete, messageApi, nodesRef, selectedNodes, t]);

    const handleDuplicateWithToast = useCallback((target?: DiagramActionTarget) => {
        const count = Array.isArray(target)
            ? new Set(target).size
            : target
                ? 1
                : selectedNodes.length;
        if (count <= 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToDuplicate'));
            return;
        }
        const targetIds = target
            ? new Set(typeof target === 'string' ? [target] : target)
            : null;
        const targetNodes = targetIds
            ? nodesRef.current.filter(node => targetIds.has(node.id))
            : selectedNodes;
        if (hasMutationLockedNode(targetNodes)) {
            messageApi.warning(t('designer.flowchart.toast.lockedSelection', '节点已锁定，请先解锁后再操作'));
            return;
        }
        handleDuplicate(target);
    }, [handleDuplicate, messageApi, nodesRef, selectedNodes, t]);

    // --- Group / Ungroup ---
    const handleGroupWithToast = useCallback(() => {
        if (selectedNodes.length < 2) {
            messageApi.info(t('designer.flowchart.toast.needTwoNodesToGroup'));
            return;
        }
        const firstParent = selectedNodes[0]?.parentId;
        const allSameParent = selectedNodes.every(n => n.parentId === firstParent);
        if (!allSameParent) {
            messageApi.warning(t('designer.flowchart.toast.groupSameLevel'));
            return;
        }
        const selectedIds = new Set(selectedNodes.map(node => node.id));
        if (hasMutationLockedNode(resolveTargetNodes(nodesRef.current, selectedIds))) {
            messageApi.warning(t('designer.flowchart.toast.lockedSelection', '节点已锁定，请先解锁后再操作'));
            return;
        }
        handleGroup();
    }, [handleGroup, messageApi, nodesRef, selectedNodes, t]);

    const handleUngroupWithToast = useCallback((targetId?: string) => {
        const candidates = targetId
            ? nodesRef.current.filter(node => node.id === targetId)
            : selectedNodes;
        const groups = candidates.filter(n => n.type === 'titleGroup' || n.type === 'subGroup');
        if (groups.length === 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToUngroup'));
            return;
        }
        const groupIds = new Set(groups.map(group => group.id));
        const affectedNodes = nodesRef.current.filter(node =>
            groupIds.has(node.id) || (node.parentId ? groupIds.has(node.parentId) : false));
        if (hasMutationLockedNode(affectedNodes)) {
            messageApi.warning(t('designer.flowchart.toast.lockedSelection', '节点已锁定，请先解锁后再操作'));
            return;
        }
        handleUngroup(groups.map(group => group.id));
    }, [handleUngroup, messageApi, nodesRef, selectedNodes, t]);

    // --- Context menu combined handler ---
    const onContextMenuActionWithToast = useCallback((action: string, targetId?: string) => {
        if (action === 'delete') {
            handleDeleteWithToast(targetId);
            return;
        }
        if (action === 'duplicate') {
            handleDuplicateWithToast(targetId);
            return;
        }
        if (action === 'cut') {
            handleCutWithToast();
            return;
        }
        if (action === 'copy') {
            handleCopyWithToast();
            return;
        }
        if (action === 'paste') {
            void handlePasteWithToast();
            return;
        }
        if (action === 'reverseEdge') {
            onContextMenuAction(action, targetId);
            messageApi.success(t('designer.flowchart.toast.edgeReversed'));
            return;
        }
        if (action === 'resetWaypoints') {
            onContextMenuAction(action, targetId);
            messageApi.success(t('designer.flowchart.toast.waypointsReset'));
            return;
        }
        if (action === 'convertToEditable') {
            onContextMenuAction(action, targetId);
            messageApi.success(t('designer.flowchart.toast.convertedToEditable', '已转为编辑状态'));
            return;
        }
        if (action === 'stopEditing') {
            onContextMenuAction(action, targetId);
            messageApi.success(t('designer.flowchart.toast.stoppedEditing', '已退出编辑状态'));
            return;
        }
        onContextMenuAction(action, targetId);
    }, [handleDeleteWithToast, handleDuplicateWithToast, handlePasteWithToast, handleCutWithToast, handleCopyWithToast, onContextMenuAction, messageApi, t]);

    return {
        showUndoableMessage,
        handleCopyWithToast,
        handlePasteWithToast,
        handleCutWithToast,
        handleDeleteWithToast,
        handleDuplicateWithToast,
        handleGroupWithToast,
        handleUngroupWithToast,
        onContextMenuActionWithToast,
    };
}
