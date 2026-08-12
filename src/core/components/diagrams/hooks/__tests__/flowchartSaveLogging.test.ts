// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
    error: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
    safeLog: safeLogState,
}));

import { logTrackedFlowchartSaveFailure } from '../flowchartSaveLogging';

describe('flowchartSaveLogging', () => {
    afterEach(() => {
        safeLogState.error.mockReset();
    });

    it('records the target without exposing secrets from rejected save actions', () => {
        logTrackedFlowchartSaveFailure('cloud', {
            status: 503,
            authorization: 'Bearer cloud-save-token',
            nested: { apiKey: 'cloud-save-api-key' },
        });

        const payload = JSON.stringify(safeLogState.error.mock.calls);
        expect(payload).toContain('[useTrackedFlowchartSaves] cloud save failed:');
        expect(payload).toContain('[redacted]');
        expect(payload).not.toContain('cloud-save-token');
        expect(payload).not.toContain('cloud-save-api-key');
    });
});
