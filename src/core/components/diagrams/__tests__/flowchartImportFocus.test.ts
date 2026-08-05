// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
    FLOWCHART_IMPORT_FOCUS_RETURN_SELECTOR,
    focusFlowchartImportTrigger,
} from '../flowchartImportFocus';

describe('flowchart import focus recovery', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('returns focus to the marked import trigger after confirmation closes', () => {
        const trigger = document.createElement('button');
        trigger.dataset.flowchartImportFocusReturn = 'true';
        document.body.appendChild(trigger);

        expect(focusFlowchartImportTrigger(document)).toBe(true);
        expect(document.activeElement).toBe(trigger);
        expect(document.querySelector(FLOWCHART_IMPORT_FOCUS_RETURN_SELECTOR)).toBe(trigger);
    });

    it('fails safely when the trigger is missing or disabled', () => {
        expect(focusFlowchartImportTrigger(document)).toBe(false);

        const trigger = document.createElement('button');
        trigger.dataset.flowchartImportFocusReturn = 'true';
        trigger.disabled = true;
        document.body.appendChild(trigger);

        expect(focusFlowchartImportTrigger(document)).toBe(false);
        expect(document.activeElement).toBe(document.body);
    });
});
