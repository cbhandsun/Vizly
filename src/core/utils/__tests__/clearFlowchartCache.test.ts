// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import { clearFlowchartCache, getFlowchartCacheKeysToClear } from '../clearFlowchartCache';

describe('clearFlowchartCache', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('returns scoped keys without clearing selected diagram identity', () => {
        const keys = getFlowchartCacheKeysToClear(' diagram-a ');

        expect(keys.localStorageKeys).toContain('flowchart-autosave-v2-diagram-a');
        expect(keys.localStorageKeys).toContain('GenericStandardDiagram.customPresets.diagram-a');
        expect(keys.localStorageKeys).toContain('flowchart-clipboard');
        expect(keys.localStorageKeys).not.toContain('diagramMenu.selectedDiagramId');
    });

    it('clears only flowchart UI cache and current diagram cache', () => {
        localStorage.setItem('flowchart-clipboard', '{"nodes":[]}');
        localStorage.setItem('flowchart.layers', '[]');
        localStorage.setItem('diagramMenu.recent', '["diagram-a"]');
        localStorage.setItem('diagramMenu.selectedDiagramId', 'diagram-a');
        localStorage.setItem('flowchart-autosave-v2-diagram-a', '{"nodes":[]}');
        localStorage.setItem('flowchart-autosave-v2-diagram-b', '{"nodes":[{"id":"b"}]}');
        localStorage.setItem('GenericStandardDiagram.customPresets.diagram-a', '{"preset":true}');
        localStorage.setItem('GenericStandardDiagram.customPresets.diagram-b', '{"preset":true}');
        localStorage.setItem('DiagramView.AIConfig_user-a', '{"apiKey":"secret"}');
        localStorage.setItem('diagram_storage_config', '{"provider":"s3"}');
        sessionStorage.setItem('layered-config-session', '{"theme":"dark"}');
        sessionStorage.setItem('diagram_storage_config_secret', 'storage-secret');

        clearFlowchartCache('diagram-a');

        expect(localStorage.getItem('flowchart-clipboard')).toBeNull();
        expect(localStorage.getItem('flowchart.layers')).toBeNull();
        expect(localStorage.getItem('diagramMenu.recent')).toBeNull();
        expect(localStorage.getItem('flowchart-autosave-v2-diagram-a')).toBeNull();
        expect(localStorage.getItem('GenericStandardDiagram.customPresets.diagram-a')).toBeNull();
        expect(sessionStorage.getItem('layered-config-session')).toBeNull();

        expect(localStorage.getItem('diagramMenu.selectedDiagramId')).toBe('diagram-a');
        expect(localStorage.getItem('flowchart-autosave-v2-diagram-b')).toBe('{"nodes":[{"id":"b"}]}');
        expect(localStorage.getItem('GenericStandardDiagram.customPresets.diagram-b')).toBe('{"preset":true}');
        expect(localStorage.getItem('DiagramView.AIConfig_user-a')).toBe('{"apiKey":"secret"}');
        expect(localStorage.getItem('diagram_storage_config')).toBe('{"provider":"s3"}');
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBe('storage-secret');
    });
});
