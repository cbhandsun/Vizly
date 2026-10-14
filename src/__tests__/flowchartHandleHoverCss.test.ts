// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('host flowchart handle hover compatibility', () => {
    it('preserves named port translations and excludes flowcharts from generic hover enlargement', () => {
        const style = document.createElement('style');
        style.textContent = readFileSync(resolve(import.meta.dirname, '../main.css'), 'utf8');
        document.head.append(style);
        try {
            const rules = [...(style.sheet?.cssRules ?? [])].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
            const generic = rules.find(rule => rule.style.transform === 'scale(1.6)');
            expect(generic?.selectorText).toBe('.react-flow__handle:not(.flowchart-handle):hover');
            for (const [side, translation] of [['top', 'translate(-50%, -50%)'], ['left', 'translate(-50%, -50%)'], ['right', 'translate(50%, -50%)'], ['bottom', 'translate(-50%, 50%)']]) {
                const rule = rules.find(candidate => candidate.selectorText.includes(`.flowchart-handle.react-flow__handle-${side}:hover`));
                expect(rule?.style.transform).toBe(translation);
                expect(rule?.style.getPropertyPriority('transform')).toBe('important');
            }
        } finally { style.remove(); }
    });
});
