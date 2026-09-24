import { describe, expect, it, vi } from 'vitest';
import { executeAICommandContent } from '../aiCommandExecution';
import type { CanvasOperations } from '../types';

const noPause = async (): Promise<void> => {};

describe('aiCommandExecution', () => {
    it('routes validated commands through the plugin before using canvas fallbacks', async () => {
        const onAddNode = vi.fn(() => 'fallback-node');
        const executePluginAction = vi.fn(async () => true);
        const context = { diagramId: 'diagram-1' };

        await executeAICommandContent({
            content: '[COMMAND: {"action":"addNode","label":"API"}]',
            canvasOps: { onAddNode },
            pluginId: 'flowchart',
            resolvePluginContext: () => context,
            executePluginAction,
            pause: noPause,
        });

        expect(executePluginAction).toHaveBeenCalledWith(
            'flowchart',
            { action: 'addNode', label: 'API' },
            context,
        );
        expect(onAddNode).not.toHaveBeenCalled();
    });

    it('executes typed canvas fallbacks and reports user-visible successes', async () => {
        const canvasOps: CanvasOperations = {
            onAddNode: vi.fn(() => 'node-1'),
            onConnectNodes: vi.fn(),
            onAutoLayout: vi.fn(),
            onGroupNodes: vi.fn(),
            onUpdateTheme: vi.fn(),
            onTogglePresentation: vi.fn(),
            onAnimatePath: vi.fn(),
        };
        const onSuccess = vi.fn();

        await executeAICommandContent({
            content: [
                '[COMMAND: {"action":"addNode","label":"API","shape":"rectangle"}]',
                '[COMMAND: {"action":"connectNodes","source":"a","target":"b","label":"calls"}]',
                '[COMMAND: {"action":"layout","strategy":"dagre"}]',
                '[COMMAND: {"action":"groupNodes","ids":["a","b"],"name":"services"}]',
                '[COMMAND: {"action":"updateTheme","style":{"--vizly-color":"red"}}]',
                '[COMMAND: {"action":"presentation","active":false}]',
                '[COMMAND: {"action":"animatePath","ids":["e1"],"duration":1200,"loop":true}]',
            ].join('\n'),
            canvasOps,
            onSuccess,
            pause: noPause,
        });

        expect(canvasOps.onAddNode).toHaveBeenCalledWith('API', 'rectangle');
        expect(canvasOps.onConnectNodes).toHaveBeenCalledWith('a', 'b', 'calls');
        expect(canvasOps.onAutoLayout).toHaveBeenCalledWith('dagre');
        expect(canvasOps.onGroupNodes).toHaveBeenCalledWith(['a', 'b'], 'services');
        expect(canvasOps.onUpdateTheme).toHaveBeenCalledWith({ '--vizly-color': 'red' });
        expect(canvasOps.onTogglePresentation).toHaveBeenCalledWith(false);
        expect(canvasOps.onAnimatePath).toHaveBeenCalledWith(['e1'], { duration: 1200, loop: true });
        expect(onSuccess).toHaveBeenCalledTimes(4);
    });

    it('keeps rejected or incompatible payloads away from canvas operations', async () => {
        const onUpdateTheme = vi.fn();
        const onSave = vi.fn();
        const onRejected = vi.fn();

        await executeAICommandContent({
            content: [
                '[COMMAND: {"action":"save"}]',
                '[COMMAND: {"action":"updateTheme","style":{"nodes":{"color":"red"}}}]',
            ].join('\n'),
            canvasOps: { onUpdateTheme, onSave },
            onRejected,
            pause: noPause,
        });

        expect(onRejected).toHaveBeenCalledWith('save', 'save requires explicit user action');
        expect(onSave).not.toHaveBeenCalled();
        expect(onUpdateTheme).not.toHaveBeenCalled();
    });

    it('isolates command failures and continues with later commands', async () => {
        const error = new Error('layout failed');
        const onExecutionError = vi.fn();
        const onTogglePresentation = vi.fn();

        await executeAICommandContent({
            content: [
                '[COMMAND: {"action":"layout"}]',
                '[COMMAND: {"action":"presentation"}]',
            ].join('\n'),
            canvasOps: {
                onAutoLayout: () => { throw error; },
                onTogglePresentation,
            },
            onExecutionError,
            pause: noPause,
        });

        expect(onExecutionError).toHaveBeenCalledWith(error, { action: 'layout' });
        expect(onTogglePresentation).toHaveBeenCalledWith(true);
    });
});
