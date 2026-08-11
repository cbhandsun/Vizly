export const resolveFlowchartToolbarHistoryCount = (value: number | undefined): number | null => (
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
);
