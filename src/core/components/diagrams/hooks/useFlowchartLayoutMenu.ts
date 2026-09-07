import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { buildFlowchartLayoutMenuModel } from '../flowchartToolbarLayoutMenu';

type Options = Omit<Parameters<typeof buildFlowchartLayoutMenuModel>[0], 'translate'>;

/** Keep menu selection and its accessible explanation on the same committed state. */
export const useFlowchartLayoutMenu = ({
    customDomainLayoutAvailable, lastDomainDirection, lastDomainStrategy, lastNodeLayout,
    laneRankPreference, laneRankDecision, onSmartLayout, onStrategyLayout,
}: Options) => {
    const { t } = useTranslation();
    const layoutMenuModel = useMemo(() => buildFlowchartLayoutMenuModel({
        customDomainLayoutAvailable, lastDomainDirection, lastDomainStrategy, lastNodeLayout,
        laneRankPreference, laneRankDecision, onSmartLayout, onStrategyLayout,
        translate: (key, fallback) => t(key, fallback),
    }), [customDomainLayoutAvailable, lastDomainDirection, lastDomainStrategy, lastNodeLayout,
        laneRankPreference, laneRankDecision, onSmartLayout, onStrategyLayout, t]);
    const baseLabel = t('designer.flowchart.layout.tooltip', '自动布局');
    const layoutTriggerLabel = layoutMenuModel.statusText
        ? `${baseLabel}：${layoutMenuModel.statusText}${layoutMenuModel.tooltipText ? `（${layoutMenuModel.tooltipText}）` : ''}`
        : baseLabel;
    return { layoutMenuModel, layoutTriggerLabel };
};
