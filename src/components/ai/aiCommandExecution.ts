import type { CanvasOperations } from './types';
import {
    extractValidatedAICommands,
    type AIValidatedCommand,
} from './aiCommandExtraction';

export type AICommandExecutionSuccess =
    | { type: 'node-added'; label: string }
    | { type: 'nodes-connected'; label: string }
    | { type: 'layout-applied'; strategy?: string }
    | { type: 'group-created'; name: string };

export interface ExecuteAICommandContentOptions {
    content: string;
    canvasOps?: CanvasOperations;
    pluginId?: string;
    resolvePluginContext?: () => unknown | null;
    executePluginAction?: (
        pluginId: string,
        command: AIValidatedCommand,
        context: unknown,
    ) => Promise<boolean>;
    onRejected?: (action: string, reason: string) => void;
    onSuccess?: (event: AICommandExecutionSuccess) => void;
    onExecutionError?: (error: unknown, command: AIValidatedCommand) => void;
    pause?: () => Promise<void>;
}

const pauseForCanvasState = (): Promise<void> => (
    new Promise((resolve) => setTimeout(resolve, 100))
);

const asCssVariableMap = (value: Record<string, unknown>): Record<string, string> | null => {
    const entries = Object.entries(value);
    if (!entries.every(([, item]) => typeof item === 'string')) return null;
    return Object.fromEntries(entries) as Record<string, string>;
};

const executeCanvasFallback = (
    command: AIValidatedCommand,
    canvasOps: CanvasOperations,
    onSuccess?: (event: AICommandExecutionSuccess) => void,
): void => {
    switch (command.action) {
        case 'addNode': {
            const label = command.label ?? '';
            const newId = canvasOps.onAddNode?.(label, command.shape ?? command.type);
            if (newId) onSuccess?.({ type: 'node-added', label });
            return;
        }
        case 'connectNodes':
            if (canvasOps.onConnectNodes) {
                canvasOps.onConnectNodes(command.source, command.target, command.label);
                onSuccess?.({ type: 'nodes-connected', label: command.label ?? '' });
            }
            return;
        case 'layout':
        case 'triggerLayout':
            if (canvasOps.onAutoLayout) {
                canvasOps.onAutoLayout(command.strategy);
                onSuccess?.({ type: 'layout-applied', strategy: command.strategy });
            }
            return;
        case 'groupNodes': {
            const name = command.name ?? command.label ?? '';
            if (canvasOps.onGroupNodes) {
                canvasOps.onGroupNodes(command.ids, name);
                onSuccess?.({ type: 'group-created', name });
            }
            return;
        }
        case 'updateTheme': {
            const cssVariables = asCssVariableMap(command.style);
            if (cssVariables) canvasOps.onUpdateTheme?.(cssVariables);
            return;
        }
        case 'presentation':
            canvasOps.onTogglePresentation?.(command.active !== false);
            return;
        case 'animatePath':
            canvasOps.onAnimatePath?.(command.ids, {
                duration: command.duration,
                loop: command.loop,
            });
            return;
        case 'addChild':
        case 'collapse':
            return;
    }
};

export const executeAICommandContent = async ({
    content,
    canvasOps,
    pluginId,
    resolvePluginContext,
    executePluginAction,
    onRejected,
    onSuccess,
    onExecutionError,
    pause = pauseForCanvasState,
}: ExecuteAICommandContentOptions): Promise<void> => {
    if (!canvasOps) return;

    const extraction = extractValidatedAICommands(content);
    extraction.rejected.slice(0, 3).forEach(({ action, reason }) => {
        onRejected?.(action, reason);
    });

    for (const command of extraction.commands) {
        try {
            if (pluginId && executePluginAction && resolvePluginContext) {
                const context = resolvePluginContext();
                if (context && await executePluginAction(pluginId, command, context)) {
                    continue;
                }
            }

            executeCanvasFallback(command, canvasOps, onSuccess);
            await pause();
        } catch (error) {
            onExecutionError?.(error, command);
        }
    }
};
