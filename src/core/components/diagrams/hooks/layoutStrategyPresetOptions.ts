import type { Node } from '@xyflow/react';
import { getQueryOrHashParamFromLocation } from '../../../utils/inputBoundary';
import { resolveLayoutDomainOrder } from '../flowchartLayoutStrategyMode';
import {
    asLayoutStrategyRecord as asRecord,
    coerceLayoutStrategyStringArray,
    coerceLayoutStrategyStringArrayRecord,
    loadLayoutStrategyPresetFromCandidates,
    resolveLayoutStrategyGeneratedGroupOptions,
} from './layoutStrategyInputBoundary';

export type LayoutStrategyPresetOptions = Readonly<{
    generatedGroupOptions: ReturnType<typeof resolveLayoutStrategyGeneratedGroupOptions>;
    domainOrder?: string[];
    subDomainOrder?: Record<string, string[]>;
}>;

export const resolveLayoutStrategyPresetOptions = async ({
    strategyName,
    allNodes,
    diagramId,
    loadLayoutPresetMap,
}: Readonly<{
    strategyName: string;
    allNodes: Node[];
    diagramId?: string;
    loadLayoutPresetMap?: () => Promise<Record<string, unknown>>;
}>): Promise<LayoutStrategyPresetOptions> => {
    let generatedGroupOptions = resolveLayoutStrategyGeneratedGroupOptions(undefined, allNodes);
    let domainOrder: string[] | undefined;
    let subDomainOrder: Record<string, string[]> | undefined;
    const locationDiagramId = getQueryOrHashParamFromLocation(
        typeof window === 'undefined' ? undefined : window.location,
        'diagram',
    );
    const candidate = await loadLayoutStrategyPresetFromCandidates(
        loadLayoutPresetMap,
        [diagramId, locationDiagramId || undefined],
    );
    const preset = candidate.preset;
    if (!preset) return { generatedGroupOptions };

    const presetRecord = asRecord(preset);
    const presetLayout = asRecord(presetRecord.layout);
    generatedGroupOptions = resolveLayoutStrategyGeneratedGroupOptions(preset, allNodes);
    domainOrder = coerceLayoutStrategyStringArray(presetLayout.domainOrder);
    subDomainOrder = coerceLayoutStrategyStringArrayRecord(presetLayout.subDomainOrder);
    if (!domainOrder && Array.isArray(presetRecord.nodes)) {
        const implicitOrder: string[] = [];
        const implicitSubOrder: Record<string, string[]> = {};
        for (const rawNode of presetRecord.nodes) {
            const presetNode = asRecord(rawNode);
            const d = String(presetNode.domain || '').trim();
            if (!d || d === '默认域' || d === 'default') continue;
            if (!implicitOrder.includes(d)) implicitOrder.push(d);
            const s = String(presetNode.subDomain || '').trim();
            if (s) {
                if (!implicitSubOrder[d]) implicitSubOrder[d] = [];
                if (!implicitSubOrder[d].includes(s)) implicitSubOrder[d].push(s);
            }
        }
        if (implicitOrder.length > 0) {
            domainOrder = resolveLayoutDomainOrder(strategyName, domainOrder, implicitOrder);
            if (!subDomainOrder) subDomainOrder = implicitSubOrder;
        }
    }
    return { generatedGroupOptions, domainOrder, subDomainOrder };
};
