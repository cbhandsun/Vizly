import React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Node, Edge } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import type { DiagramActionTarget } from './useDiagramActions';
import type { ClipboardCutResult, ClipboardPasteResult } from './useClipboard';
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
    handleCopy: (targetNodeIds?: string[]) => void;
    handlePaste: () => Promise<ClipboardPasteResult>;
    handleCut: () => Promise<ClipboardCutResult>;
    // Group actions
    handleGroup: () => void;
    handleUngroup: (targetNodeIds?: string[]) => void;
    // Context menu action
    onContextMenuAction: (action: string, targetId?: string) => boolean | void;
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
                    <button
                        type="button"
                        onClick={() => {
                            undo();
                            messageApi.destroy(key);
                        }}
                        style={{
                            appearance: 'none',
                            border: 0,
                            padding: 0,
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            font: 'inherit',
                            fontWeight: 600,
                            textDecoration: 'underline',
                        }}
                    >
                        {t('designer.flowchart.undo.action', '撤销')}
                    </button>
                </span>
            ),
            duration: 3,
        });
    }, [messageApi, t, undo]);

    // --- Copy / Paste / Cut ---
    // 📋 Copy 操作静默执行（行业标准：Figma/Miro 的 Ctrl+C 不弹 toast）
    const handleCopyWithToast = useCallback((targetId?: string) => {
        const targetIsSelected = targetId
            ? selectedNodes.some(node => node.id === targetId)
            : false;
        const targetNodeIds = targetId && !targetIsSelected ? [targetId] : undefined;
        if (!targetNodeIds && selectedNodes.length === 0) {
            return; // 无选中 → 静默忽略
        }
        handleCopy(targetNodeIds);
    }, [handleCopy, selectedNodes]);

    const handlePasteWithToast = useCallback(async () => {
        const result = await handlePaste();
        if (result === 'scope-changed') {
            messageApi.warning(t(
                'designer.flowchart.toast.pasteScopeChanged',
                '页面或图表已切换，粘贴已取消，请重试',
            ));
            return;
        }
        if (result === 'unsupported') {
            messageApi.warning(t(
                'designer.flowchart.toast.unsupportedClipboard',
                '剪贴板内容不受支持，请复制 Vizly 节点或完整 Mermaid 流程图后重试',
            ));
            return;
        }
        if (result === 'empty') {
            messageApi.info(t('designer.flowchart.toast.nothingToPaste'));
        }
    }, [handlePaste, messageApi, t]);

    const handleCutWithToast = useCallback(async () => {
        if (selectedNodes.length === 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToCut'));
            return;
        }
        if (hasMutationLockedNode(selectedNodes)) {
            messageApi.warning(t('designer.flowchart.toast.lockedSelection', '节点已锁定，请先解锁后再操作'));
            return;
        }
        const result = await handleCut();
        if (result === 'failed') {
            messageApi.warning(t(
                'designer.flowchart.toast.clipboardWriteFailed',
                '无法写入剪贴板，已保留所选节点，请检查浏览器权限后重试',
            ));
            return;
        }
        if (result === 'scope-changed') {
            messageApi.warning(t(
                'designer.flowchart.toast.cutScopeChanged',
                '页面或图表已切换，剪切已取消，请重试',
            ));
        }
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
        showUndoableMessage(t('designer.flowchart.toast.deleted', counts));
    }, [getDeleteCounts, handleDelete, messageApi, nodesRef, selectedNodes, showUndoableMessage, t]);

    const handleDuplicateWithToast = useCallback((target?: DiagramActionTarget) => {
        const targetIds = target
            ? new Set(typeof target === 'string' ? [target] : target)
            : null;
        const targetNodes = targetIds
            ? nodesRef.current.filter(node => targetIds.has(node.id))
            : selectedNodes;
        const count = targetNodes.length;
        if (count === 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToDuplicate'));
            return;
        }
        if (hasMutationLockedNode(targetNodes)) {
            messageApi.warning(t('designer.flowchart.toast.lockedSelection', '节点已锁定，请先解锁后再操作'));
            return;
        }
        handleDuplicate(target);
        showUndoableMessage(t('designer.flowchart.toast.duplicated', { nodes: count }));
    }, [handleDuplicate, messageApi, nodesRef, selectedNodes, showUndoableMessage, t]);

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
            handleCopyWithToast(targetId);
            return;
        }
        if (action === 'paste') {
            void handlePasteWithToast();
            return;
        }
        if (action === 'reverseEdge') {
            if (onContextMenuAction(action, targetId)) {
                showUndoableMessage(t('designer.flowchart.toast.edgeReversed'));
            }
            return;
        }
        if (action === 'resetWaypoints') {
            if (onContextMenuAction(action, targetId)) {
                showUndoableMessage(t('designer.flowchart.toast.waypointsReset'));
            }
            return;
        }
        if (action === 'convertToEditable') {
            if (onContextMenuAction(action, targetId)) {
                showUndoableMessage(t('designer.flowchart.toast.convertedToEditable', '已转为编辑状态'));
            }
            return;
        }
        if (action === 'stopEditing') {
            if (onContextMenuAction(action, targetId)) {
                showUndoableMessage(t('designer.flowchart.toast.stoppedEditing', '已退出编辑状态'));
            }
            return;
        }
        onContextMenuAction(action, targetId);
    }, [handleDeleteWithToast, handleDuplicateWithToast, handlePasteWithToast, handleCutWithToast, handleCopyWithToast, onContextMenuAction, showUndoableMessage, t]);

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
