import { describe, expect, it, vi } from 'vitest';

import {
    createMindMapHistoryAvailabilityController,
    EMPTY_MIND_MAP_HISTORY_AVAILABILITY,
} from '../mindMapHistoryAvailability';

const createHarness = (options?: {
    clearHistory?: () => void;
    redo?: () => void;
    undo?: () => void;
}) => {
    const operationListeners = new Set<(operation: unknown) => void>();
    const target = {
        clearHistory: options?.clearHistory ?? vi.fn(),
        redo: options?.redo ?? vi.fn(),
        undo: options?.undo ?? vi.fn(),
    };
    const originalMethods = { ...target };
    const controller = createMindMapHistoryAvailabilityController(target, listener => {
        operationListeners.add(listener);
        return () => operationListeners.delete(listener);
    });

    return {
        controller,
        fireOperation: (operation: unknown) => {
            operationListeners.forEach(listener => listener(operation));
        },
        operationListeners,
        originalMethods,
        target,
    };
};

describe('mind map history availability', () => {
    it('starts with both actions unavailable and ignores incomplete operation input', () => {
        const { controller, fireOperation } = createHarness();

        expect(controller.getSnapshot()).toBe(EMPTY_MIND_MAP_HISTORY_AVAILABILITY);
        fireOperation(null);
        fireOperation([]);
        fireOperation({});
        fireOperation({ name: '' });
        fireOperation({ name: 'beginEdit' });

        expect(controller.getSnapshot()).toBe(EMPTY_MIND_MAP_HISTORY_AVAILABILITY);
    });

    it('tracks the native operation, undo, and redo lifecycle', () => {
        const { controller, fireOperation, originalMethods, target } = createHarness();
        const notify = vi.fn();
        controller.subscribe(notify);

        fireOperation({ name: 'addChild' });
        expect(controller.getSnapshot()).toEqual({ canRedo: false, canUndo: true });

        target.undo();
        expect(originalMethods.undo).toHaveBeenCalledOnce();
        expect(controller.getSnapshot()).toEqual({ canRedo: true, canUndo: false });

        target.redo();
        expect(originalMethods.redo).toHaveBeenCalledOnce();
        expect(controller.getSnapshot()).toEqual({ canRedo: false, canUndo: true });
        expect(notify).toHaveBeenCalledTimes(3);
    });

    it('truncates the redo branch after a new operation and resets on clearHistory', () => {
        const { controller, fireOperation, originalMethods, target } = createHarness();

        fireOperation({ name: 'addChild' });
        fireOperation({ name: 'finishEdit' });
        target.undo();
        expect(controller.getSnapshot()).toEqual({ canRedo: true, canUndo: true });

        fireOperation({ name: 'reshapeNode' });
        expect(controller.getSnapshot()).toEqual({ canRedo: false, canUndo: true });

        target.clearHistory();
        expect(originalMethods.clearHistory).toHaveBeenCalledOnce();
        expect(controller.getSnapshot()).toEqual({ canRedo: false, canUndo: false });
    });

    it('does not advance its cursor when a native history method fails', () => {
        const undoError = new Error('undo failed');
        const redoError = new Error('redo failed');
        const undoHarness = createHarness({ undo: vi.fn(() => { throw undoError; }) });
        undoHarness.fireOperation({ name: 'addChild' });

        expect(() => undoHarness.target.undo()).toThrow(undoError);
        expect(undoHarness.controller.getSnapshot()).toEqual({ canRedo: false, canUndo: true });

        const redoHarness = createHarness({ redo: vi.fn(() => { throw redoError; }) });
        redoHarness.fireOperation({ name: 'addChild' });
        redoHarness.target.undo();

        expect(() => redoHarness.target.redo()).toThrow(redoError);
        expect(redoHarness.controller.getSnapshot()).toEqual({ canRedo: true, canUndo: false });
    });

    it('restores owned methods and detaches operation listeners on disposal', () => {
        const { controller, fireOperation, operationListeners, originalMethods, target } = createHarness();
        const wrappedUndo = target.undo;

        expect(operationListeners).toHaveLength(1);
        controller.dispose();
        controller.dispose();

        expect(operationListeners).toHaveLength(0);
        expect(target.undo).toBe(originalMethods.undo);
        expect(target.redo).toBe(originalMethods.redo);
        expect(target.clearHistory).toBe(originalMethods.clearHistory);
        fireOperation({ name: 'addChild' });
        expect(controller.getSnapshot()).toBe(EMPTY_MIND_MAP_HISTORY_AVAILABILITY);

        const competingUndo = vi.fn();
        const nextHarness = createHarness();
        nextHarness.target.undo = competingUndo;
        nextHarness.controller.dispose();
        expect(nextHarness.target.undo).toBe(competingUndo);
        expect(wrappedUndo).not.toBe(originalMethods.undo);
    });
});
