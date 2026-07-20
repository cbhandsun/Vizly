import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { addHistoryRecord } from './mindmapHistoryStore';
import {
    logMindmapWrapperCollapsedBadgeFailure,
    logMindmapWrapperHistoryRecordFailure,
    logMindmapWrapperShapeSyncFailure,
} from './mindmapWrapperLogging';

const OPERATION_NAMES: Readonly<Record<string, string>> = {
    insertSibling: '添加兄弟节点',
    addChild: '添加子节点',
    removeNodes: '删除节点',
    removeNode: '删除节点',
    setNodeTopic: '修改节点文本',
    moveNode: '移动节点位置',
    setNodeNote: '修改节点备注',
    setNodeTags: '修改节点标签',
    setNodeIcons: '修改节点图标',
    setNodeHyperLink: '修改节点链接',
    outline_structure_change: '大纲拖拽排序',
    template_apply: '套用模板',
    ai_custom_action: 'AI 交互式指令处理',
    clearHistory: '清空历史',
    import: '导入数据',
    restore_version: '恢复历史版本',
};

type TimerHandle = ReturnType<typeof setTimeout>;

export interface MindElixirOperationEffectDependencies {
    recordHistory: typeof addHistoryRecord;
    schedule: (callback: () => void, delay: number) => TimerHandle;
    clearSchedule: (handle: TimerHandle) => void;
}

const DEFAULT_DEPENDENCIES: MindElixirOperationEffectDependencies = {
    recordHistory: addHistoryRecord,
    schedule: (callback, delay) => setTimeout(callback, delay),
    clearSchedule: handle => clearTimeout(handle),
};

const readOperationName = (operation: unknown): string => {
    if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) return '';
    const name = (operation as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
};

const readNodeShape = (node: NodeObj): string | undefined => {
    const shape = (node as NodeObj & { shapeClass?: unknown }).shapeClass;
    return typeof shape === 'string' && shape ? shape : undefined;
};

export const bindMindElixirOperationEffects = ({
    mind,
    root,
    onSave,
    dependencies: overrides = {},
}: {
    mind: MindElixirInstance;
    root: ParentNode;
    onSave: () => void;
    dependencies?: Partial<MindElixirOperationEffectDependencies>;
}): (() => void) => {
    const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
    let saveTimer: TimerHandle | null = null;

    const scheduleSave = () => {
        if (saveTimer !== null) dependencies.clearSchedule(saveTimer);
        saveTimer = dependencies.schedule(() => {
            saveTimer = null;
            onSave();
        }, 800);
    };

    const onOperation = (operation: unknown) => {
        scheduleSave();
        const description = OPERATION_NAMES[readOperationName(operation)] || '更新思维导图';
        try {
            dependencies.recordHistory(description, mind.getData().nodeData);
        } catch (error) {
            logMindmapWrapperHistoryRecordFailure(error);
        }
    };

    const updateBadgesFromData = () => {
        try {
            root.querySelectorAll('.me-collapsed-badge').forEach(element => element.remove());
            const walkNodes = (node: NodeObj) => {
                if (node.expanded === false && node.children && node.children.length > 0) {
                    try {
                        const topic = mind.findEle(node.id);
                        if (topic && !topic.querySelector('.me-collapsed-badge')) {
                            const badge = document.createElement('span');
                            badge.className = 'me-collapsed-badge node-children-count';
                            badge.textContent = String(node.children.length);
                            topic.appendChild(badge);
                        }
                    } catch (error) {
                        logMindmapWrapperCollapsedBadgeFailure(error);
                    }
                }
                (node.children ?? []).forEach(walkNodes);
            };
            walkNodes(mind.getData().nodeData);
        } catch (error) {
            logMindmapWrapperCollapsedBadgeFailure(error);
        }
    };

    const applyShapes = () => {
        try {
            const walkNodes = (node: NodeObj) => {
                const shape = readNodeShape(node);
                try {
                    const topic = mind.findEle(node.id) as HTMLElement | null;
                    const wrapper = topic?.closest('me-wrapper') as HTMLElement | null;
                    if (wrapper) {
                        if (shape) wrapper.setAttribute('data-shape', shape);
                        else wrapper.removeAttribute('data-shape');
                        if (node.note) wrapper.setAttribute('data-note', '1');
                        else wrapper.removeAttribute('data-note');
                    }
                } catch (error) {
                    logMindmapWrapperShapeSyncFailure(error);
                }
                (node.children ?? []).forEach(walkNodes);
            };
            walkNodes(mind.getData().nodeData);
        } catch (error) {
            logMindmapWrapperShapeSyncFailure(error);
        }
    };

    mind.bus.addListener('operation', onOperation);
    mind.bus.addListener('operation', updateBadgesFromData);
    mind.bus.addListener('operation', applyShapes);
    const badgeTimer = dependencies.schedule(updateBadgesFromData, 350);
    const shapeTimer = dependencies.schedule(applyShapes, 400);

    return () => {
        mind.bus.removeListener('operation', onOperation);
        mind.bus.removeListener('operation', updateBadgesFromData);
        mind.bus.removeListener('operation', applyShapes);
        dependencies.clearSchedule(badgeTimer);
        dependencies.clearSchedule(shapeTimer);
        if (saveTimer !== null) {
            dependencies.clearSchedule(saveTimer);
            saveTimer = null;
        }
    };
};
