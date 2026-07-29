import { describe, expect, it } from 'vitest';

import { selectDisplayedFlowchartSaveStatus } from '../hooks/useTrackedFlowchartSaves';

describe('flowchart save status', () => {
    it('defaults to local autosave state', () => {
        const local = { saving: false, lastSaved: 10, error: null };
        expect(selectDisplayedFlowchartSaveStatus(local, null)).toEqual({
            target: 'local',
            state: local,
        });
    });

    it('shows the active manual cloud save', () => {
        const cloud = {
            target: 'cloud' as const,
            updatedAt: 20,
            state: { saving: true, lastSaved: null, error: null },
        };
        expect(selectDisplayedFlowchartSaveStatus(
            { saving: false, lastSaved: 10, error: null },
            cloud,
        )).toEqual({ target: 'cloud', state: cloud.state });
    });

    it('returns to local status after a newer autosave', () => {
        const local = { saving: false, lastSaved: 30, error: null };
        expect(selectDisplayedFlowchartSaveStatus(local, {
            target: 'cloud',
            updatedAt: 20,
            state: { saving: false, lastSaved: 20, error: null },
        })).toEqual({ target: 'local', state: local });
    });

    it('prioritizes a current local failure over an older manual save', () => {
        const local = { saving: false, lastSaved: null, error: 'quota' };
        expect(selectDisplayedFlowchartSaveStatus(local, {
            target: 'cloud',
            updatedAt: 20,
            state: { saving: false, lastSaved: 20, error: null },
        })).toEqual({ target: 'local', state: local });
    });
});
