import React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Node, Edge } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import { parseClipboardJson } from '../../../utils/flowchartClipboard';

/**
 * 🚀 P2 性能优化：从 FlowchartDesigner 提取的 Toast 包装层
 * 
 * 将所有 *WithToast 回调集中管理，减少主组件的 hook 链长度和 reconciliation 开销。
 */

interface UseToastActionsProps {
    messageApi: MessageInstance;
    notificationApi: NotificationInstance;
    // Core actions (from useDiagramActions)
    handleDelete: (targetId?: string) => void;
    handleDuplicate: (targetId?: string) => void;
    // Clipboard actions
    handleCopy: () => void;
    handlePaste: () => void;
    handleCut: () => void;
    // Group actions
    handleGroup: () => void;
    handleUngroup: () => void;
    // Context menu action
    onContextMenuAction: (action: string, targetId?: string) => void;
    // History
    undo: () => void;
    // State refs (avoid unstable deps)
    selectedNodes: Node[];
    selectedEdges: Edge[];
    nodesRef: React.RefObject<Node[]>;
    edgesRef: React.RefObject<Edge[]>;
    // Clipboard key
    clipboardKey: string;
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
    clipboardKey,
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
        if (selectedNodes.length === 0 && selectedEdges.length === 0) {
            return; // 无选中 → 静默忽略
        }
        handleCopy();
    }, [handleCopy, selectedEdges.length, selectedNodes.length]);

    const handlePasteWithToast = useCallback(() => {
        const raw = localStorage.getItem(clipboardKey);
        if (!raw) {
            messageApi.info(t('designer.flowchart.toast.nothingToPaste'));
            return;
        }
        const parsed = parseClipboardJson(raw);
        if (!parsed) {
            messageApi.info(t('designer.flowchart.toast.nothingToPaste'));
            return;
        }
        handlePaste();
    }, [clipboardKey, handlePaste, messageApi, t]);

    const handleCutWithToast = useCallback(() => {
        if (selectedNodes.length === 0 && selectedEdges.length === 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToCut'));
            return;
        }
        handleCut();
    }, [handleCut, messageApi, selectedEdges.length, selectedNodes.length, t]);

    // --- Delete / Duplicate ---
    const getDeleteCounts = useCallback((targetId?: string) => {
        if (!targetId) {
            return { nodes: selectedNodes.length, edges: selectedEdges.length };
        }
        const isNode = nodesRef.current!.some(n => n.id === targetId);
        const isEdge = edgesRef.current!.some(e => e.id === targetId);
        if (isNode) {
            if (selectedNodes.some(n => n.id === targetId)) {
                return { nodes: selectedNodes.length, edges: selectedEdges.length };
            }
            return { nodes: 1, edges: 0 };
        }
        if (isEdge) return { nodes: 0, edges: 1 };
        return { nodes: 0, edges: 0 };
    }, [selectedEdges, selectedNodes, nodesRef, edgesRef]);

    const handleDeleteWithToast = useCallback((targetId?: string) => {
        const counts = getDeleteCounts(targetId);
        if (counts.nodes + counts.edges === 0) return;
        handleDelete(targetId);
    }, [getDeleteCounts, handleDelete]);

    const handleDuplicateWithToast = useCallback((targetId?: string) => {
        const count = targetId ? 1 : selectedNodes.length;
        if (count <= 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToDuplicate'));
            return;
        }
        handleDuplicate(targetId);
    }, [handleDuplicate, messageApi, selectedNodes, t]);

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
        handleGroup();
    }, [handleGroup, messageApi, selectedNodes, t]);

    const handleUngroupWithToast = useCallback(() => {
        const groups = selectedNodes.filter(n => n.type === 'titleGroup' || n.type === 'subGroup');
        if (groups.length === 0) {
            messageApi.info(t('designer.flowchart.toast.nothingToUngroup'));
            return;
        }
        handleUngroup();
    }, [handleUngroup, messageApi, selectedNodes, t]);

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
            handlePasteWithToast();
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
