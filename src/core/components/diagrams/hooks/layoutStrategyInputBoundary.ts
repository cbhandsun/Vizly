import type { Edge, Node } from '@xyflow/react';
import { coerceDiagramId } from '../../../utils/inputBoundary';
import { getNodeAbsolutePosition } from './diagramNodeParenting';

export const asLayoutStrategyRecord = (value: unknown): Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

type RuntimePositionedLayoutNode = Node & {
    positionAbsolute?: unknown;
};

/** React Flow runtime geometry must not override a newly staged layout. */
export const clearLayoutRuntimeAbsolutePosition = (node: Node): Node => ({
    ...node,
    positionAbsolute: undefined,
} as RuntimePositionedLayoutNode);

/** Layout engines receive absolute business nodes and only their own edges.
 * Containers are rebuilt by the selected engine; annotations stay separate. */
export const prepareFlatLayoutStrategyGraph = (nodes: Node[], edges: Edge[]) => {
    const nonLayoutTypes = new Set(['mindmap', 'mindmap-boundary', 'sticky-note']);
    const excludedTypes = new Set(['titleGroup', 'subGroup', 'domain', 'group', ...nonLayoutTypes]);
    const layoutNodes = nodes.filter(node => !excludedTypes.has(node.type || '')).map(node => (
        clearLayoutRuntimeAbsolutePosition({
            ...node,
            position: getNodeAbsolutePosition(node, nodes),
            parentId: undefined,
            extent: undefined,
        })
    ));
    const nodeIds = new Set(layoutNodes.map(node => node.id));
    const layoutEdges = edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { layoutNodes, layoutEdges, nonLayoutTypes };
};

export const coerceLayoutStrategyStringArray = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const strings = value.filter((item): item is string => typeof item === 'string');
    return strings.length === value.length ? strings : undefined;
};

export const coerceLayoutStrategyStringArrayRecord = (
    value: unknown,
): Record<string, string[]> | undefined => {
    const record = asLayoutStrategyRecord(value);
    const entries = Object.entries(record);
    if (entries.length === 0) return undefined;
    const result: Record<string, string[]> = {};
    for (const [key, entryValue] of entries) {
        const strings = coerceLayoutStrategyStringArray(entryValue);
        if (!strings) return undefined;
        result[key] = strings;
    }
    return result;
};

const getNodeDataString = (node: Node, key: string): string => (
    typeof asLayoutStrategyRecord(node.data)[key] === 'string'
        ? String(asLayoutStrategyRecord(node.data)[key]).trim()
        : ''
);

const isGeneratedTitleGroupNode = (node: Node): boolean => (
    String(node.type || '') === 'titleGroup' || String(node.id || '').startsWith('titlegroup-')
);

const isGeneratedSubGroupNode = (node: Node): boolean => (
    String(node.type || '') === 'subGroup' || String(node.id || '').startsWith('subgroup-')
);

const isHiddenLayoutNode = (node: Node): boolean => (
    node.hidden === true || asLayoutStrategyRecord(node.data).hidden === true
);

const uniqueVisibleDataValues = (
    nodes: Node[],
    predicate: (node: Node) => boolean,
    key: string,
): string[] | undefined => {
    const values = nodes
        .filter(node => predicate(node) && !isHiddenLayoutNode(node))
        .map(node => getNodeDataString(node, key))
        .filter(Boolean);
    return values.length ? Array.from(new Set(values)) : undefined;
};

export const resolveLayoutStrategyGeneratedGroupOptions = (preset: unknown, currentNodes: Node[] = []) => {
    const presetRecord = asLayoutStrategyRecord(preset);
    const layout = asLayoutStrategyRecord(presetRecord.layout);
    if (Object.keys(layout).length === 0 && currentNodes.length > 0) {
        const hasGeneratedContainers = currentNodes.some(node => (
            isGeneratedTitleGroupNode(node) || isGeneratedSubGroupNode(node)
        ));
        if (hasGeneratedContainers) {
            const visibleDomains = uniqueVisibleDataValues(currentNodes, isGeneratedTitleGroupNode, 'domain');
            const visibleSubDomains = uniqueVisibleDataValues(currentNodes, isGeneratedSubGroupNode, 'subDomain');
            return {
                generateDomainGroups: Boolean(visibleDomains?.length),
                generateSubDomainGroups: Boolean(visibleSubDomains?.length),
                domainWhitelist: visibleDomains,
                subDomainWhitelist: visibleSubDomains,
            };
        }
    }
    return {
        generateDomainGroups: layout.generateDomainGroups !== false,
        generateSubDomainGroups: layout.generateSubDomainGroups !== false,
        domainWhitelist: coerceLayoutStrategyStringArray(layout.domainWhitelist),
        subDomainWhitelist: coerceLayoutStrategyStringArray(layout.subDomainWhitelist),
    };
};

/** An explicit swimlane command needs a lane for every business domain.
 * Preset container visibility still applies to other layouts and subgroups. */
export const resolveLayoutCommandGroupOptions = (
    strategy: string,
    options: ReturnType<typeof resolveLayoutStrategyGeneratedGroupOptions>,
) => strategy === 'domain-lanes'
    ? { ...options, generateDomainGroups: true, domainWhitelist: undefined }
    : options;

export const stripHiddenGeneratedLayoutNodes = (
    nodes: Node[],
    groupOptions?: ReturnType<typeof resolveLayoutStrategyGeneratedGroupOptions>,
): Node[] => nodes.filter(node => {
    if (isHiddenLayoutNode(node)) return false;
    if (groupOptions?.generateDomainGroups === false && isGeneratedTitleGroupNode(node)) return false;
    if (groupOptions?.generateSubDomainGroups === false && isGeneratedSubGroupNode(node)) return false;
    return true;
});

export const resolveLayoutStrategyPresetFromCandidates = (
    presetMap: Record<string, unknown>,
    candidates: Array<string | undefined>,
): { id?: string; preset?: unknown } => {
    for (const candidate of candidates) {
        const id = coerceDiagramId(candidate || '');
        if (!id) continue;
        const preset = presetMap[id];
        if (preset) return { id, preset };
    }
    return {};
};

export const loadLayoutStrategyPresetFromCandidates = async (
    loadPresetMap: (() => Promise<Record<string, unknown>>) | undefined,
    candidates: Array<string | undefined>,
): Promise<{ id?: string; preset?: unknown }> => {
    if (!loadPresetMap) return {};
    const presetMap = await loadPresetMap();
    if (!presetMap || typeof presetMap !== 'object' || Array.isArray(presetMap)) return {};
    return resolveLayoutStrategyPresetFromCandidates(presetMap, candidates);
};
