import type { Dispatch, SetStateAction } from 'react';

import type { DiagramDefinition } from '@/core/types/diagram-components';
import { canMutateDiagramDocument } from './diagramViewerPermissions';
import { DiagramSettingsPanel } from './ui/DiagramSettingsPanel';
import { useDiagramSettingsMutationHandlers } from './useDiagramSettingsMutationHandlers';

type ValueWriter<T> = (value: T) => void | Promise<void>;

interface DiagramViewerSettingsPanelProps {
    edgeMode: string;
    elkAlgorithm: string;
    isPresentationMode: boolean;
    isReadonly: boolean;
    layoutStrategy: string;
    linkOrientationEnabled: boolean;
    nodeLayoutStrategy: string;
    selectedDiagram?: DiagramDefinition;
    selectedDiagramId: string;
    setEdgeMode: ValueWriter<'advanced-smart' | 'native'>;
    setElkAlgorithm: ValueWriter<string>;
    setLayoutStrategy: ValueWriter<string>;
    setNodeLayoutStrategy: ValueWriter<string>;
    setRefreshNonce: Dispatch<SetStateAction<number>>;
    setShowOnlyMainFlow: (value: boolean) => void;
    showOnlyMainFlow: boolean;
}

export const DiagramViewerSettingsPanel = ({
    edgeMode, elkAlgorithm, isPresentationMode, isReadonly, layoutStrategy,
    linkOrientationEnabled, nodeLayoutStrategy, selectedDiagram, selectedDiagramId,
    setEdgeMode, setElkAlgorithm, setLayoutStrategy, setNodeLayoutStrategy,
    setRefreshNonce, setShowOnlyMainFlow, showOnlyMainFlow,
}: DiagramViewerSettingsPanelProps) => {
    const editingEnabled = canMutateDiagramDocument({ isReadonly, isPresentationMode });
    const mutations = useDiagramSettingsMutationHandlers({
        editingEnabled, setEdgeMode, setElkAlgorithm, setLayoutStrategy,
        setNodeLayoutStrategy, setRefreshNonce,
    });

    return (
        <DiagramSettingsPanel
            key={editingEnabled ? 'editable-settings' : 'view-settings'}
            selectedDiagram={selectedDiagram}
            selectedDiagramId={selectedDiagramId}
            edgeMode={edgeMode}
            onEdgeModeChange={mutations.onEdgeModeChange}
            layoutStrategy={layoutStrategy}
            onLayoutStrategyChange={mutations.onLayoutStrategyChange}
            nodeLayoutStrategy={nodeLayoutStrategy}
            onNodeLayoutStrategyChange={mutations.onNodeLayoutStrategyChange}
            elkAlgorithm={elkAlgorithm}
            onElkAlgorithmChange={mutations.onElkAlgorithmChange}
            linkOrientationEnabled={linkOrientationEnabled}
            showOnlyMainFlow={showOnlyMainFlow}
            onShowOnlyMainFlowChange={setShowOnlyMainFlow}
            onRefreshRequest={mutations.onRefreshRequest}
            editingEnabled={editingEnabled}
        />
    );
};
