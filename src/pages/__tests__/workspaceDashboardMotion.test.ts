import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readCss = (relativePath: string) => readFileSync(
    resolve(process.cwd(), relativePath),
    'utf8',
);

interface StyleRule {
    selector: string;
    body: string;
    /** At-rule preludes wrapping the rule, e.g. `@media (...)`. */
    containers: string[];
    /** Keyframe steps describe the animation rather than consuming it. */
    insideKeyframes: boolean;
}

/** Walks the stylesheet block by block so nested `@media` rules stay addressable. */
const parseStyleRules = (
    source: string,
    containers: string[] = [],
    insideKeyframes = false,
): StyleRule[] => {
    const found: StyleRule[] = [];
    let prelude = '';
    let index = 0;

    const readBlock = (open: number) => {
        let depth = 0;
        let cursor = open;
        for (; cursor < source.length; cursor += 1) {
            if (source[cursor] === '{') depth += 1;
            if (source[cursor] === '}') {
                depth -= 1;
                if (depth === 0) break;
            }
        }
        return cursor;
    };

    while (index < source.length) {
        const character = source[index];

        if (character === '{') {
            const end = readBlock(index);
            const body = source.slice(index + 1, end);
            const header = prelude.trim();

            if (header.startsWith('@')) {
                found.push(...parseStyleRules(
                    // Re-scan the body with the at-rule prelude pushed onto the stack.
                    body,
                    [...containers, header],
                    insideKeyframes || header.startsWith('@keyframes'),
                ));
            } else if (header) {
                for (const selector of header.split(',')) {
                    const trimmed = selector.trim();
                    if (trimmed) {
                        found.push({ selector: trimmed, body, containers, insideKeyframes });
                    }
                }
            }

            prelude = '';
            index = end + 1;
            continue;
        }

        if (character === '}') {
            prelude = '';
            index += 1;
            continue;
        }

        prelude += character;
        index += 1;
    }

    return found;
};

const collectRules = (css: string) => (
    // Nested parse calls re-scan substrings, so a recursive helper needs the
    // same comment stripping as the top-level scan.
    parseStyleRules(css.replace(/\/\*[\s\S]*?\*\//g, ''))
);

const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';

const isReducedMotionRule = (rule: StyleRule) => (
    rule.containers.some(container => container.startsWith(REDUCED_MOTION_QUERY))
);

const hasAnimation = (rule: StyleRule) => (
    /(^|[;{\s])animation\s*:\s*(?!none\b)[^;]+;/i.test(rule.body)
);

/** The animated node, independent of any ancestor scoping in the selector. */
const animatedNode = (selector: string) => selector.split(/\s+/).at(-1) ?? selector;

const WEBKIT_ANIMATION = /-webkit-animation/;

describe('workspace dashboard reduced-motion coverage', () => {
    const css = readCss('src/pages/WorkspaceDashboard.css');
    const allRules = collectRules(css);
    const reducedMotionRules = allRules.filter(isReducedMotionRule);

    it('declares a reduced-motion block that neutralizes the workspace chrome', () => {
        expect(reducedMotionRules.length).toBeGreaterThan(0);

        const selectors = reducedMotionRules.map(rule => rule.selector);
        for (const selector of [
            '.diagram-card',
            '.diagram-list-row',
            '.skeleton-card',
            '.diagram-context-menu',
            '.diagram-open-pending svg',
            '.workspace-create-spinner',
            '.workspace-empty-art',
        ]) {
            expect(selectors).toContain(selector);
        }
    });

    it('neutralizes every animated selector from the dashboard stylesheet', () => {
        const animatedRules = allRules
            .filter(rule => !rule.insideKeyframes && hasAnimation(rule))
            .filter(rule => !WEBKIT_ANIMATION.test(rule.body));

        expect(animatedRules.length).toBeGreaterThan(0);

        const neutralized = new Set(reducedMotionRules.map(rule => animatedNode(rule.selector)));
        const uncovered = animatedRules
            .map(rule => animatedNode(rule.selector))
            .filter(node => !neutralized.has(node));

        expect(uncovered).toEqual([]);
    });
});
