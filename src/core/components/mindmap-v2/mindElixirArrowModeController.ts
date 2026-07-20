import type { MindElixirInstance, NodeObj, Topic } from 'mind-elixir';

import { analyzeNodesRelationship } from './mindmapAIService';
import { emitVizlyMindMapOperation } from './mindmapOperationBridge';
import { logMindmapToolbarArrowFailure } from './mindmapToolbarLogging';

type RelationshipResult = Awaited<ReturnType<typeof analyzeNodesRelationship>>;
type SelectNodesListener = (nodes: NodeObj[], element: Topic) => void;

export interface MindElixirArrowModeDependencies {
    analyzeRelationship: (left: string, right: string) => Promise<RelationshipResult>;
    emitOperation: typeof emitVizlyMindMapOperation;
    logFailure: typeof logMindmapToolbarArrowFailure;
}

const DEFAULT_DEPENDENCIES: MindElixirArrowModeDependencies = {
    analyzeRelationship: analyzeNodesRelationship,
    emitOperation: emitVizlyMindMapOperation,
    logFailure: logMindmapToolbarArrowFailure,
};

export const createMindElixirArrowModeController = ({
    mind,
    onEnabledChange,
    dependencies: overrides = {},
}: {
    mind: MindElixirInstance;
    onEnabledChange: (enabled: boolean) => void;
    dependencies?: Partial<MindElixirArrowModeDependencies>;
}) => {
    const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
    let fromElement: Topic | null = null;
    let listener: SelectNodesListener | null = null;
    let enabled = false;

    const disable = () => {
        if (listener) {
            mind.bus.removeListener('selectNodes', listener as never);
            listener = null;
        }
        fromElement = null;
        if (enabled) {
            enabled = false;
            onEnabledChange(false);
        }
    };

    const completeArrow = async (from: Topic, to: Topic) => {
        try {
            mind.createArrow(from, to);
            const arrows = mind.arrows || [];
            const arrow = arrows[arrows.length - 1];
            if (!arrow) return;
            arrow.label = '...';
            mind.renderArrow();

            const fromId = from.dataset?.nodeid;
            const toId = to.dataset?.nodeid;
            if (!fromId || !toId) {
                arrow.label = '关联';
                mind.renderArrow();
                return;
            }
            const data = mind.getData();
            const fromNode = mind.getObjById(fromId, data.nodeData);
            const toNode = mind.getObjById(toId, data.nodeData);
            if (!fromNode || !toNode) {
                arrow.label = '关联';
                mind.renderArrow();
                return;
            }

            try {
                const result = await dependencies.analyzeRelationship(fromNode.topic, toNode.topic);
                arrow.label = 'error' in result ? '关联' : result.relationText;
            } catch (error) {
                arrow.label = '关联';
                dependencies.logFailure(error);
            }
            mind.renderArrow();
            dependencies.emitOperation(mind, {
                name: 'editArrowLabel',
                obj: arrow,
            });
        } catch (error) {
            dependencies.logFailure(error);
        }
    };

    const enable = () => {
        if (enabled) return;
        enabled = true;
        onEnabledChange(true);
        listener = (_nodes, element) => {
            if (!element) return;
            if (!fromElement) {
                fromElement = element;
                return;
            }
            const start = fromElement;
            disable();
            void completeArrow(start, element);
        };
        mind.bus.addListener('selectNodes', listener as never);
    };

    return {
        toggle: () => enabled ? disable() : enable(),
        dispose: disable,
        isEnabled: () => enabled,
    };
};
