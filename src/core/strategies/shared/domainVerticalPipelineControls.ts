export type DomainVerticalStopAfterPhase = 'none' | 'phase1' | 'phase2';

export interface DomainVerticalPipelineControlSources {
  optionStopAfterPhase?: unknown;
  configuredStopAfterPhase?: unknown;
  optionLockSubGroupHeights?: unknown;
  optionFitDomainContent?: unknown;
  configuredConstantGapMode?: unknown;
}

export interface DomainVerticalPipelineControls {
  stopAfterPhase: DomainVerticalStopAfterPhase;
  lockSubGroupHeights: boolean;
  fitDomainContent: boolean;
  constantGapMode: boolean;
}

const parseStopAfterPhase = (
  optionValue: unknown,
  configuredValue: unknown,
): DomainVerticalStopAfterPhase => {
  const candidate = optionValue ?? configuredValue ?? 'none';
  if (typeof candidate !== 'string') return 'none';
  const normalized = candidate.toLowerCase().replace(/\s+/g, '');
  return normalized === 'phase1' || normalized === 'phase2'
    ? normalized
    : 'none';
};

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/**
 * Parses external options and layered configuration once so the layout pipeline
 * can use immutable, explicitly typed control state.
 */
export const resolveDomainVerticalPipelineControls = (
  sources: DomainVerticalPipelineControlSources,
): DomainVerticalPipelineControls => ({
  stopAfterPhase: parseStopAfterPhase(
    sources.optionStopAfterPhase,
    sources.configuredStopAfterPhase,
  ),
  lockSubGroupHeights: booleanOr(
    sources.optionLockSubGroupHeights,
    false,
  ),
  fitDomainContent: booleanOr(sources.optionFitDomainContent, true),
  constantGapMode: booleanOr(sources.configuredConstantGapMode, true),
});
