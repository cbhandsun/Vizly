import { getFlowchartMarqueeCanvasInteraction } from './flowchartMarqueeInteraction';
import { resolveFlowchartLeftClearance } from './flowchartChromeLayout';
import type { FlowchartDesignerViewModel } from './flowchartDesignerViewModel';
import { useFlowchartFileDrop } from './hooks/useFlowchartFileDrop';
import { supportsReactFlowMinimap } from './reactFlowMinimapCapability';
import { useContainerCollapseRequests } from './flowchartDesignerViewHelpers';

export const useFlowchartDesignerViewSetup = (model: FlowchartDesignerViewModel) => {
    useContainerCollapseRequests(model.toggleGroupCollapse);
    const editingEnabled = !model.isReadonly && !model.presentationActive;
    const fileDrop = useFlowchartFileDrop({
        importFile: model.handleImport,
        requestImport: model.handleRequestImport,
        onCanvasDragOver: model.onDragOver,
        onCanvasDrop: model.onDrop,
        confirmOkText: model.t('designer.flowchart.import.confirmDropOk', '继续导入'),
        enabled: editingEnabled,
    });

    return {
        actualLeftOffset: resolveFlowchartLeftClearance({
            isSidebarHidden: model.isSidebarHidden,
            leftDrawerOpen: model.leftDrawerOpen,
            leftDrawerWidth: model.leftDrawerWidth,
        }),
        editingEnabled,
        fileDrop,
        marqueeCanvasInteraction: getFlowchartMarqueeCanvasInteraction(model.isMarqueeActive),
        reactFlowMinimapSupported: supportsReactFlowMinimap(model.activePlugin),
        showEditingChrome: !model.presentationActive,
    };
};
