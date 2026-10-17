import { useEffect } from 'react';
import { useYjsCollaboration, type YjsCollaborationOptions } from './YjsProviderHooks';
import type { YjsCollaborationState } from './useDeferredYjsCollaboration';

export default function YjsCollaborationDriver({ options, onState }: {
    options: YjsCollaborationOptions; onState: (state: YjsCollaborationState | null) => void;
}) {
    const state = useYjsCollaboration(options);
    // Update command closures without forcing a host rerender when status is unchanged.
    useEffect(() => { onState(state); });
    useEffect(() => () => onState(null), [onState]);
    return null;
}
