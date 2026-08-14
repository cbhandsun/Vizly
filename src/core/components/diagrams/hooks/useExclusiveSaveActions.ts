import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveActionTarget = 'local' | 'cloud';

interface UseExclusiveSaveActionsOptions {
    onCloudSave?: () => Promise<void>;
    onDirectSave?: () => Promise<void>;
}

export const useExclusiveSaveActions = ({
    onCloudSave,
    onDirectSave,
}: UseExclusiveSaveActionsOptions) => {
    const [pendingSaveTarget, setPendingSaveTarget] = useState<SaveActionTarget | null>(null);
    const activeSaveRef = useRef<Promise<void> | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const runSaveAction = useCallback((
        target: SaveActionTarget,
        action: () => Promise<void>,
    ) => {
        if (activeSaveRef.current) {
            return activeSaveRef.current;
        }

        setPendingSaveTarget(target);
        let saveOperation: Promise<void>;
        try {
            saveOperation = action();
        } catch (error) {
            saveOperation = Promise.reject(error);
        }
        activeSaveRef.current = saveOperation;
        const finishSave = () => {
            if (activeSaveRef.current !== saveOperation) return;
            activeSaveRef.current = null;
            if (mountedRef.current) {
                setPendingSaveTarget(null);
            }
        };
        void saveOperation.then(finishSave, finishSave);
        return saveOperation;
    }, []);

    const handleDirectSave = useCallback(
        () => onDirectSave ? runSaveAction('local', onDirectSave) : Promise.resolve(),
        [onDirectSave, runSaveAction],
    );
    const handleCloudSave = useCallback(
        () => onCloudSave ? runSaveAction('cloud', onCloudSave) : Promise.resolve(),
        [onCloudSave, runSaveAction],
    );

    return {
        handleCloudSave,
        handleDirectSave,
        pendingSaveTarget,
    };
};
