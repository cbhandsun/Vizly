import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a stable getter so pending asynchronous operations compare against
 * the latest diagram and page after React commits a document change.
 */
export const useDiagramOperationScope = (
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
