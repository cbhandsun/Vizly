import type { LaneRankDecision, LaneRankPreference } from '../../../types/domainLaneRank';
import type { LayoutSelection } from '../layoutSelectionPersistence';

export const layoutSelectionToolbarProps = (selection: LayoutSelection) => ({
    lastDomainDirection: selection.direction,
    lastDomainStrategy: selection.strategy,
    lastNodeLayout: selection.nodeLayout,
    laneRankPreference: selection.laneRankPreference,
    laneRankDecision: selection.laneRankDecision,
});

export interface DesignerHeaderLayoutMemoState {
    lastDomainDirection?: string;
    lastDomainStrategy?: string;
    lastNodeLayout?: string;
    layoutBusy?: boolean;
    laneRankPreference?: LaneRankPreference;
    laneRankDecision?: LaneRankDecision;
}

export const haveSameDesignerHeaderLayoutState = (
    previous: DesignerHeaderLayoutMemoState,
    next: DesignerHeaderLayoutMemoState,
): boolean => (
    previous.layoutBusy === next.layoutBusy
    && previous.lastDomainStrategy === next.lastDomainStrategy
    && previous.lastDomainDirection === next.lastDomainDirection
    && previous.lastNodeLayout === next.lastNodeLayout
    && previous.laneRankPreference === next.laneRankPreference
    && previous.laneRankDecision === next.laneRankDecision
);
