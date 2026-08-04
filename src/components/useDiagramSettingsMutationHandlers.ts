import { useCallback } from 'react';

type ValueWriter<T> = (value: T) => void | Promise<void>;

interface DiagramSettingsMutationOptions {
    editingEnabled: boolean;
    setEdgeMode: ValueWriter<'advanced-smart' | 'native'>;
    setElkAlgorithm: ValueWriter<string>;
    setLayoutStrategy: ValueWriter<string>;
    setNodeLayoutStrategy: ValueWriter<string>;
    setRefreshNonce: (updater: (previous: number) => number) => void;
}

export const useDiagramSettingsMutationHandlers = ({
    editingEnabled,
    setEdgeMode,
    setElkAlgorithm,
    setLayoutStrategy,
    setNodeLayoutStrategy,
    setRefreshNonce,
}: DiagramSettingsMutationOptions) => {
    const onEdgeModeChange = useCallback(async (value: 'advanced-smart' | 'native') => {
        if (editingEnabled) await setEdgeMode(value);
    }, [editingEnabled, setEdgeMode]);
    const onLayoutStrategyChange = useCallback(async (value: string) => {
        if (editingEnabled) await setLayoutStrategy(value);
    }, [editingEnabled, setLayoutStrategy]);
    const onNodeLayoutStrategyChange = useCallback(async (value: string) => {
        if (editingEnabled) await setNodeLayoutStrategy(value);
    }, [editingEnabled, setNodeLayoutStrategy]);
    const onElkAlgorithmChange = useCallback(async (value: string) => {
        if (editingEnabled) await setElkAlgorithm(value);
    }, [editingEnabled, setElkAlgorithm]);
    const onRefreshRequest = useCallback(() => {
        if (editingEnabled) setRefreshNonce(previous => previous + 1);
    }, [editingEnabled, setRefreshNonce]);

    return {
        onEdgeModeChange,
        onElkAlgorithmChange,
        onLayoutStrategyChange,
        onNodeLayoutStrategyChange,
        onRefreshRequest,
    };
};
