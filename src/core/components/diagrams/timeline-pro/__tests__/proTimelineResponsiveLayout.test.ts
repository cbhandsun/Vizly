import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(
    path.resolve(process.cwd(), 'src/core/components/diagrams/timeline-pro/ProTimelineCanvas.css'),
    'utf8',
);

describe('professional timeline responsive layout', () => {
    it('reserves the mobile top toolbar and bottom editing controls', () => {
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.pro-timeline-workspace\s*\{[\s\S]*?top:\s*calc\(96px \+ env\(safe-area-inset-top, 0px\)\);/);
        expect(css).toMatch(/\.pro-timeline-workspace\s*\{[\s\S]*?bottom:\s*calc\(164px \+ env\(safe-area-inset-bottom, 0px\)\);/);
    });

    it('preserves useful canvas width and keeps timeline chrome visible on narrow screens', () => {
        expect(css).toMatch(/\.pro-timeline-task-list\s*\{[\s\S]*?width:\s*min\(280px, 48vw\) !important;/);
        expect(css).toMatch(/\.pro-timeline-task-column--secondary,[\s\S]*?\.pro-timeline-task-resize-handle\s*\{[\s\S]*?display:\s*none !important;/);
        expect(css).toMatch(/\.pro-timeline-chrome\s*\{[\s\S]*?right:\s*12px !important;/);
        expect(css).toMatch(/\.pro-timeline-chrome--analysis\s*\{[\s\S]*?bottom:\s*64px !important;/);
    });
});
