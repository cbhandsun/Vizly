import type { ConnectionValidationResult } from '../../types/connection';
import { ConnectionValidationStatus } from './ConnectionValidationStatus';
import { FlowchartLayoutProgress } from './FlowchartLayoutProgress';

export const FlowchartCanvasStatusOverlay = ({
    layoutBusy,
    layoutLabel,
    connectionValidation,
}: {
    layoutBusy: boolean;
    layoutLabel: string;
    connectionValidation: ConnectionValidationResult | null;
}) => (
    <>
        <FlowchartLayoutProgress visible={layoutBusy} label={layoutLabel} />
        <ConnectionValidationStatus validation={connectionValidation} />
    </>
);
