import { useCallback, useRef, useState, type DragEvent } from 'react';

import { isImageLikeImportFile } from '@/core/utils/fileImportGuards';

import type { FlowchartImportEvent } from '../flowchartImportHandler';
import type { FlowchartImportRequestOptions } from './useFlowchartImportRequest';

interface UseFlowchartFileDropOptions {
    importFile: (event: FlowchartImportEvent) => Promise<void> | void;
    requestImport: (options?: FlowchartImportRequestOptions) => void;
    onCanvasDragOver: (event: DragEvent) => void;
    onCanvasDrop: (event: DragEvent) => void;
    confirmOkText: string;
    enabled: boolean;
}

const containsFiles = (dataTransfer: DataTransfer): boolean => (
    dataTransfer.files.length > 0
    || Array.from(dataTransfer.types || []).includes('Files')
);

export function useFlowchartFileDrop({
    importFile,
    requestImport,
    onCanvasDragOver,
    onCanvasDrop,
    confirmOkText,
    enabled,
}: UseFlowchartFileDropOptions) {
    const [isFileDragActive, setIsFileDragActive] = useState(false);
    const dragDepthRef = useRef(0);

    const resetFileDrag = useCallback(() => {
        dragDepthRef.current = 0;
        setIsFileDragActive(false);
    }, []);

    const handleDragEnter = useCallback((event: DragEvent) => {
        if (!enabled || !containsFiles(event.dataTransfer)) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsFileDragActive(true);
    }, [enabled]);

    const handleDragOver = useCallback((event: DragEvent) => {
        if (!containsFiles(event.dataTransfer)) {
            onCanvasDragOver(event);
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
        if (enabled) setIsFileDragActive(true);
    }, [enabled, onCanvasDragOver]);

    const handleDragLeave = useCallback((event: DragEvent) => {
        if (dragDepthRef.current === 0) return;
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsFileDragActive(false);
    }, []);

    const handleDrop = useCallback((event: DragEvent) => {
        const file = event.dataTransfer.files[0];
        resetFileDrag();
        if (file && !enabled) {
            event.preventDefault();
            requestImport();
            return;
        }
        if (!file || isImageLikeImportFile(file)) {
            onCanvasDrop(event);
            return;
        }

        event.preventDefault();
        requestImport({
            okText: confirmOkText,
            onConfirmationClosed: resetFileDrag,
            startImport: () => {
                void importFile({
                    target: {
                        files: [file],
                        value: '',
                    },
                });
            },
        });
    }, [confirmOkText, enabled, importFile, onCanvasDrop, requestImport, resetFileDrag]);

    return {
        isFileDragActive,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}
