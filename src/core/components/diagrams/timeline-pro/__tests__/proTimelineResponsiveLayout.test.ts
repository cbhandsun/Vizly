import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(
    path.resolve(process.cwd(), 'src/core/components/diagrams/timeline-pro/ProTimelineCanvas.css'),
    'utf8',
);
const canvasSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/core/components/diagrams/timeline-pro/ProTimelineCanvas.tsx'),
    'utf8',
);
const resourceDrawerCss = fs.readFileSync(
    path.resolve(process.cwd(), 'src/core/components/diagrams/timeline-pro/ProResourceDrawer.css'),
    'utf8',
);
const taskLayerCss = fs.readFileSync(
    path.resolve(process.cwd(), 'src/core/components/diagrams/timeline-pro/ProTaskLayer.css'),
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
        expect(canvasSource).toMatch(/<ProResourceDrawer[\s\S]*?<\/div>\s*<ProTimelineChrome/);
        expect(css).toMatch(/\.pro-timeline-chrome\s*\{[\s\S]*?left:\s*12px !important;[\s\S]*?right:\s*12px !important;/);
        expect(css).toMatch(/\.pro-timeline-chrome\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?white-space:\s*nowrap;/);
        expect(css).toMatch(/\.pro-timeline-chrome > \*\s*\{[\s\S]*?flex:\s*0 0 auto;/);
        expect(css).toMatch(/\.pro-timeline-chrome--analysis\s*\{[\s\S]*?bottom:\s*116px !important;/);
        expect(css).toMatch(/\.pro-timeline-chrome--scale\s*\{[\s\S]*?bottom:\s*64px !important;/);
    });

    it('provides visible keyboard focus for task actions and the desktop resize separator', () => {
        expect(css).toMatch(/\.pro-timeline-task-row button:focus-visible,[\s\S]*?\.pro-timeline-task-resize-handle:focus-visible[\s\S]*?outline:\s*2px solid/);
        expect(css).toMatch(/\.pro-timeline-task-resize-handle:focus-visible\s*\{[\s\S]*?background:\s*color-mix\(/);
    });
});

describe('professional resource drawer responsive layout', () => {
    it('uses the full narrow viewport above the mobile editing dock', () => {
        expect(resourceDrawerCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.pro-resource-drawer \.ant-drawer-content-wrapper\s*\{[\s\S]*?width:\s*100vw !important;/);
        expect(resourceDrawerCss).toMatch(/\.pro-resource-drawer__kpis\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
    });

    it('provides a visible keyboard focus treatment for task actions', () => {
        expect(resourceDrawerCss).toMatch(/\.pro-resource-task-action:focus-visible\s*\{[\s\S]*?outline:\s*2px solid/);
    });
});

describe('professional task layer interaction affordances', () => {
    it('shows keyboard focus on task bars and their direct manipulation handles', () => {
        expect(taskLayerCss).toMatch(/\.pro-timeline-task-bar:focus-visible,[\s\S]*?\.pro-timeline-task-progress-handle:focus-visible,[\s\S]*?\.pro-timeline-task-resize-handle:focus-visible[\s\S]*?outline:\s*2px solid/);
    });

    it('enlarges narrow progress and duration handles for coarse pointers', () => {
        expect(taskLayerCss).toMatch(/@media \(pointer: coarse\)[\s\S]*?\.pro-timeline-task-progress-handle,[\s\S]*?\.pro-timeline-task-resize-handle[\s\S]*?min-width:\s*24px/);
    });
});
