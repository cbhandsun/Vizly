import React from 'react';

import { ensureBuiltInPlugins } from '@vizly/core/plugins';
import type { DiagramComponentProps } from '@vizly/core/types';
import { loadStandardPresetById } from '@/data/standardized/presetLoader';

export const PLUGIN_EMPTY_CANVAS_IDS = new Set(['flowchart']);

export const loadFlowchartDesigner = async (pluginId?: string, presetId?: string) => {
    const precompiledRouteReady = presetId
        ? import('@vizly/core/routing-runtime')
            .then(
                module => module.prefetchBaseReactFlowPrecompiledRoute(presetId),
                () => false,
            )
        : Promise.resolve(false);
    const [{ FlowchartDesigner }] = await Promise.all([
        import('@vizly/core/react'),
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
