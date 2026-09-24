import React, { useEffect } from 'react';
import { FlowchartDesigner as UnifiedDesigner } from '@vizly/core/react';
import { PluginRegistry } from '@vizly/core/plugin-registry';
import { StandardFlowPlugin } from '../components/diagrams/plugins/StandardFlowPlugin';
import { ReactFlowProvider } from '@xyflow/react';

export default function UnifiedDesignerTestPage() {
    const pluginRegistry = PluginRegistry.getInstance();
    
    // 确保插件已注册
    useEffect(() => {
        if (!pluginRegistry.getPlugin('standard-flow')) {
            pluginRegistry.register(new StandardFlowPlugin(), true);
        }
    }, [pluginRegistry]);

    return (
        <ReactFlowProvider>
            <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
                <UnifiedDesigner pluginId="standard-flow" />
            </div>
        </ReactFlowProvider>
    );
}
