import { describe, expect, it, vi } from 'vitest';

import {
    buildFlowchartImportConfirm,
    requestFlowchartImport,
    shouldConfirmFlowchartImport,
} from '../flowchartImportRequest';

describe('flowchart import request', () => {
    it('only requires confirmation when the current page has nodes or edges', () => {
        expect(shouldConfirmFlowchartImport([], [])).toBe(false);
        expect(shouldConfirmFlowchartImport([{ id: 'node-1' }], [])).toBe(true);
        expect(shouldConfirmFlowchartImport([], [{ id: 'edge-1' }])).toBe(true);
    });

    it('builds a destructive confirmation that preserves the supplied copy and action', () => {
        const onConfirm = vi.fn();
        const onClosed = vi.fn();

        const config = buildFlowchartImportConfirm({
            title: 'Replace current page?',
            content: '1 node and 2 edges will be replaced.',
            okText: 'Choose file',
            cancelText: 'Cancel',
            onConfirm,
            onClosed,
        });

        expect(config).toEqual(expect.objectContaining({
            title: 'Replace current page?',
            content: '1 node and 2 edges will be replaced.',
            okText: 'Choose file',
            cancelText: 'Cancel',
            okButtonProps: { danger: true },
            autoFocusButton: 'cancel',
        }));

        config.afterClose();
        expect(onClosed).toHaveBeenCalledTimes(1);

        config.onOk();
        config.afterClose();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it('opens the picker immediately for an empty editable page', () => {
        const openFilePicker = vi.fn();
        const showConfirmation = vi.fn();

        const result = requestFlowchartImport({
            editingEnabled: true,
            nodes: [],
            edges: [],
            title: 'Replace current page?',
            content: 'Content',
            okText: 'Choose file',
            cancelText: 'Cancel',
            onEditingUnavailable: vi.fn(),
            openFilePicker,
            showConfirmation,
        });

        expect(result).toBe('opened');
        expect(openFilePicker).toHaveBeenCalledTimes(1);
        expect(showConfirmation).not.toHaveBeenCalled();
    });

    it('requires confirmation before opening the picker for a populated page', () => {
        const openFilePicker = vi.fn();
        const onConfirmationClosed = vi.fn();
        const showConfirmation = vi.fn();

        const result = requestFlowchartImport({
            editingEnabled: true,
            nodes: [{ id: 'node-1' }],
            edges: [{ id: 'edge-1' }],
            title: 'Replace current page?',
            content: '1 node and 1 edge will be replaced.',
            okText: 'Choose file',
            cancelText: 'Cancel',
            onEditingUnavailable: vi.fn(),
            openFilePicker,
            onConfirmationClosed,
            showConfirmation,
        });

        expect(result).toBe('confirmation-requested');
        expect(openFilePicker).not.toHaveBeenCalled();
        expect(showConfirmation).toHaveBeenCalledWith(expect.objectContaining({
            okButtonProps: { danger: true },
            autoFocusButton: 'cancel',
        }));

        const confirmation = showConfirmation.mock.calls[0]?.[0];
        confirmation?.afterClose();
        expect(onConfirmationClosed).toHaveBeenCalledTimes(1);

        confirmation?.onOk();
        confirmation?.afterClose();
        expect(openFilePicker).toHaveBeenCalledTimes(1);
        expect(onConfirmationClosed).toHaveBeenCalledTimes(1);
    });

    it('blocks import requests when editing is unavailable', () => {
        const onEditingUnavailable = vi.fn();
        const openFilePicker = vi.fn();
        const showConfirmation = vi.fn();

        const result = requestFlowchartImport({
            editingEnabled: false,
            nodes: [{ id: 'node-1' }],
            edges: [],
            title: 'Replace current page?',
            content: 'Content',
            okText: 'Choose file',
            cancelText: 'Cancel',
            onEditingUnavailable,
            openFilePicker,
            showConfirmation,
        });

        expect(result).toBe('blocked');
        expect(onEditingUnavailable).toHaveBeenCalledTimes(1);
        expect(openFilePicker).not.toHaveBeenCalled();
        expect(showConfirmation).not.toHaveBeenCalled();
    });

    it('blocks duplicate import requests while another import is active', () => {
        const onImportInProgress = vi.fn();
        const openFilePicker = vi.fn();
        const showConfirmation = vi.fn();

        const result = requestFlowchartImport({
            editingEnabled: true,
            importInProgress: true,
            nodes: [{ id: 'node-1' }],
            edges: [],
            title: 'Replace current page?',
            content: 'Content',
            okText: 'Choose file',
            cancelText: 'Cancel',
            onEditingUnavailable: vi.fn(),
            onImportInProgress,
            openFilePicker,
            showConfirmation,
        });

        expect(result).toBe('busy');
        expect(onImportInProgress).toHaveBeenCalledTimes(1);
        expect(openFilePicker).not.toHaveBeenCalled();
        expect(showConfirmation).not.toHaveBeenCalled();
    });
});
