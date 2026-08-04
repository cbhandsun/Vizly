import { useState, useCallback, useRef, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { getDescendantIds } from '../diagrams/hooks/useCollapsibleGroups';
import { getQueryOrHashParamFromLocation } from '../../utils/inputBoundary';
import { dispatchContainerCollapseRequest } from '../diagrams/containerCollapseRequest';
import { useDiagramStore } from '../../store/useDiagramStore';

/**
 * useContainerNode — 容器类节点（TitleGroup/SubGroup）的公共逻辑
 * 
 * 提取三个重复模式：
 * 1. 双击编辑标题（startEditing / commitEdit / cancelEdit）
 * 2. 折叠/展开带尺寸记忆（toggleCollapse）
 * 3. 调试开关（debugEnabled）
 */

interface UseContainerNodeOptions {
  /** 节点 ID */
  id: string | undefined;
  /** 节点 data（含 collapsed, childIds, description 等） */
  data: {
    collapsed?: boolean;
    childIds?: string[];
    description?: string;
    label?: string;
    [key: string]: unknown;
  };
  /** 折叠时缩小到的标题栏高度 */
  titleBarHeight?: number;
  /** 展开时的默认恢复高度 */
  defaultExpandedHeight?: number;
  /** commitEdit 时是否同步更新 data.label（TitleGroupNode 需要，SubGroupNode 不需要） */
  syncLabel?: boolean;
}

export function useContainerNode({
  id,
  data,
  syncLabel = false,
}: UseContainerNodeOptions) {
  const { setNodes } = useReactFlow();

  // ─── 双击编辑标题 ───────────────────────────────────
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setEditValue(data.description || data.label || '');
    setIsEditingTitle(true);
  }, [data.description, data.label]);

  const commitEdit = useCallback(() => {
    if (!id || !isEditingTitle) return;
    const trimmed = editValue.trim();
    const original = data.description || data.label || '';
    if (trimmed && trimmed !== original) {
      setNodes((nds) => nds.map(n => {
        if (n.id !== id) return n;
        const updates: Record<string, unknown> = { description: trimmed };
        if (syncLabel) updates.label = trimmed;
        return { ...n, data: { ...n.data, ...updates } };
      }));
    }
    setIsEditingTitle(false);
  }, [id, isEditingTitle, editValue, data.description, data.label, syncLabel, setNodes]);

  const cancelEdit = useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  // ─── 折叠/展开（带尺寸记忆） ──────────────────────────
  const toggleCollapse = useCallback((target: HTMLElement) => {
    if (!id) return;
    dispatchContainerCollapseRequest(target, id);
  }, [id]);

  // ─── 调试开关 ──────────────────────────────────────
  const debugEnabled = ((): boolean => {
    try {
      const fromUrl = getQueryOrHashParamFromLocation(
        typeof window === 'undefined' ? undefined : window.location,
        'themeDebug'
      ) === '1';
      const fromStorage = typeof window !== 'undefined' && localStorage.getItem('diagram-theme-debug') === 'true';
      return !!(fromUrl || fromStorage);
    } catch {
      return false;
    }
  })();

  // ─── 子节点动态计数 ─────────────────────────────────────
  // 从业务状态计数，避免 React Flow 过滤 hidden 节点后丢失展开入口。
  const childCount = useDiagramStore(s => {
      if (!id) return 0;
      // 避免深拷贝死循环，只需要算数量
      return getDescendantIds(s.nodes, id).length;
  });

  return {
    // 双击编辑
    isEditingTitle,
    editValue,
    setEditValue,
    inputRef,
    startEditing,
    commitEdit,
    cancelEdit,
    // 折叠
    toggleCollapse,
    childCount,
    // 调试
    debugEnabled,
  };
}
