import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a stable getter so pending clipboard reads compare against the latest
 * diagram after React commits a route or document change.
 */
export const useClipboardOperationScope = (
    diagramId: string,
    getPageOperationScope: () => string,
) => {
    const diagramIdRef = useRef(diagramId);

    useLayoutEffect(() => {
        diagramIdRef.current = diagramId;
    }, [diagramId]);

    return useCallback(
        () => `${diagramIdRef.current}:${getPageOperationScope()}`,
        [getPageOperationScope],
    );
};
