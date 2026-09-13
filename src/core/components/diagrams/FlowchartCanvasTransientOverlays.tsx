import type { ComponentProps } from 'react';

import { GestureOverlay } from '../shared/GestureOverlay';
import { FlowchartCanvasStatusOverlay } from './FlowchartCanvasStatusOverlay';

interface FlowchartCanvasTransientOverlaysProps {
    layoutBusy: boolean;
    layoutLabel: string;
    connectionValidation: ComponentProps<typeof FlowchartCanvasStatusOverlay>['connectionValidation'];
    gesture: { zoom: number; visible: boolean };
}

export const FlowchartCanvasTransientOverlays = ({
    layoutBusy,
    layoutLabel,
    connectionValidation,
    gesture,
}: FlowchartCanvasTransientOverlaysProps) => (
    <>
        <FlowchartCanvasStatusOverlay
            layoutBusy={layoutBusy}
            layoutLabel={layoutLabel}
            connectionValidation={connectionValidation}
        />
        <GestureOverlay zoom={gesture.zoom} visible={gesture.visible} />
    </>
);
