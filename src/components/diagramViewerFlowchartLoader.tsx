import React from 'react';

import { ensureBuiltInPlugins } from '@/core/plugins/builtInPlugins';
import type { DiagramComponentProps } from '@/core/types/diagram-components';
import { loadStandardPresetById } from '@/data/standardized/presetLoader';

export const PLUGIN_EMPTY_CANVAS_IDS = new Set(['flowchart']);

export const loadFlowchartDesigner = async (pluginId?: string, presetId?: string) => {
    const precompiledRouteReady = presetId
        ? import('@/core/components/shared/baseReactFlowPrecompiledRoutePrefetch')
            .then(
                module => module.prefetchBaseReactFlowPrecompiledRoute(presetId),
                () => false,
            )
        : Promise.resolve(false);
    const [{ default: FlowchartDesigner }] = await Promise.all([
        import('@/core/components/diagrams/FlowchartDesigner'),
        ensureBuiltInPlugins(pluginId || 'flowchart'),
        loadStandardPresetById(presetId),
        precompiledRouteReady,
    ]);

    return {
        default: (props: DiagramComponentProps) => React.createElement(
            FlowchartDesigner,
            pluginId ? { ...props, pluginId } : props,
        ),
    };
};
