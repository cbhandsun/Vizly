import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { appMessage } from '../../../utils/antdStaticBridge';
import {
    validateProTimelineDependencyConnection,
    validateProTimelineDependencyUpdate,
    type ProTimelineDependencyConnectionResult,
} from './proTimelineDependencyConnection';
import { requestProTimelineSnapshot } from './proTimelineHistory';

interface ProTimelineDependencyActionsOptions {
    nodes: Node[];
    edges: Edge[];
    setEdges: Dispatch<SetStateAction<Edge[]>>;
}

export function useProTimelineDependencyActions({
    nodes,
    edges,
    setEdges,
}: ProTimelineDependencyActionsOptions) {
    const tasks = useMemo(() => nodes.map((node) => ({
        id: node.id,
        startDate: node.data?.date ?? node.data?.startDate,
        endDate: node.data?.endDate ?? node.data?.date ?? node.data?.startDate,
    })), [nodes]);

    const onTaskConnect = useCallback((
        sourceId: string,
        targetId: string,
    ): ProTimelineDependencyConnectionResult => {
        const result = validateProTimelineDependencyConnection({ sourceId, targetId, tasks, edges });
        if (!result.ok) {
            appMessage.warning(result.message);
            return result;
        }
        requestProTimelineSnapshot();
        setEdges((currentEdges) => currentEdges.some((edge) => (
            edge.source === sourceId && edge.target === targetId
        )) ? currentEdges : [...currentEdges, {
            id: `e-${sourceId}-${targetId}`,
            source: sourceId,
            target: targetId,
            type: 'smoothstep',
        }]);
        appMessage.success('依赖关系创建成功，可使用撤销恢复。');
        return result;
    }, [edges, setEdges, tasks]);

    const handleDeleteDependency = useCallback((
        sourceId: string,
        targetId: string,
    ): ProTimelineDependencyConnectionResult => {
        if (!edges.some((edge) => edge.source === sourceId && edge.target === targetId)) {
            const result = {
                ok: false as const,
                code: 'missing-dependency' as const,
                message: '依赖操作失败：该依赖已不存在，请刷新后重试。',
            };
            appMessage.warning(result.message);
            return result;
        }
        requestProTimelineSnapshot();
        setEdges((currentEdges) => currentEdges.filter((edge) => !(
            edge.source === sourceId && edge.target === targetId
        )));
        appMessage.success('依赖关系删除成功，可使用撤销恢复。');
        return { ok: true };
    }, [edges, setEdges]);

    const handleUpdateDependency = useCallback((
        oldSourceId: string,
        oldTargetId: string,
        sourceId: string,
        targetId: string,
    ): ProTimelineDependencyConnectionResult => {
        const result = validateProTimelineDependencyUpdate({
            oldSourceId,
            oldTargetId,
            sourceId,
            targetId,
            tasks,
            edges,
        });
        if (!result.ok) {
            appMessage.warning(result.message);
            return result;
        }
        const existingEdge = edges.find((edge) => (
            edge.source === oldSourceId && edge.target === oldTargetId
        ));
        if (!existingEdge) return result;
        if (sourceId === oldSourceId && targetId === oldTargetId) return result;
        requestProTimelineSnapshot();
        setEdges((currentEdges) => currentEdges.map((edge): Edge => (
            edge.id === existingEdge.id
                ? { ...edge, source: sourceId, target: targetId }
                : edge
        )));
        appMessage.success('依赖关系已更新，可使用撤销恢复。');
        return result;
    }, [edges, setEdges, tasks]);

    return { handleDeleteDependency, handleUpdateDependency, onTaskConnect };
}
