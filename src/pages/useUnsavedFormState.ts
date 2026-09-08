import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep unload decisions current while React schedules the UI update and
 * removes the dirty-state listener. The listener exists only for dirty renders;
 * a successful save must stop blocking before its success notification fires.
 */
export const useUnsavedFormState = () => {
    const [hasUnsavedChanges, setState] = useState(false);
    const currentValue = useRef(false);
    const setHasUnsavedChanges = useCallback((nextValue: boolean) => {
        currentValue.current = nextValue;
        setState(nextValue);
    }, []);

    useEffect(() => {
        if (!hasUnsavedChanges) return;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!currentValue.current) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    return [hasUnsavedChanges, setHasUnsavedChanges] as const;
};
