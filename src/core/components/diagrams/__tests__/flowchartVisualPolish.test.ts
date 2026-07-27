import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readRelativeFile = (relativePath: string) => readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
);

describe('flowchart visual polish stylesheet', () => {
    it('is loaded after the legacy canvas styles so its state rules are authoritative', () => {
        const designerSource = readRelativeFile('../FlowchartDesigner.tsx');
        const legacyIndex = designerSource.indexOf("import './FlowchartDesigner.css';");
        const controlsIndex = designerSource.indexOf("import './ModernControls.css';");
        const polishIndex = designerSource.indexOf("import './FlowchartVisualPolish.css';");

        expect(legacyIndex).toBeGreaterThanOrEqual(0);
        expect(controlsIndex).toBeGreaterThan(legacyIndex);
        expect(polishIndex).toBeGreaterThan(controlsIndex);
    });

    it('covers the primary node, edge, label, connection, dark, and reduced-motion states', () => {
        const stylesheet = readRelativeFile('../FlowchartVisualPolish.css');

        expect(stylesheet).toContain('.diagram-root .flowchart-node:hover');
        expect(stylesheet).toContain('.diagram-root .react-flow__node-custom .diagram-node-glass');
        expect(stylesheet).toContain("[data-handleid='right']");
        expect(stylesheet).toContain('.diagram-root .react-flow__node.selected');
        expect(stylesheet).toContain('.diagram-root .react-flow__node.rf-connectable');
        expect(stylesheet).toContain('.diagram-root .react-flow__edge-stablePath');
        expect(stylesheet).toContain('.diagram-root .react-flow__edge.selected .react-flow__edge-path');
        expect(stylesheet).toContain('.diagram-root .edge-label-premium');
        expect(stylesheet).toContain('.diagram-root .stable-path-edge-label');
        expect(stylesheet).toContain("[data-theme='dark'] .diagram-root");
        expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('keeps selection feedback static instead of adding perpetual glow animations', () => {
        const stylesheet = readRelativeFile('../FlowchartVisualPolish.css');

        expect(stylesheet).toMatch(
            /\.diagram-root \.react-flow__node\.selected::after\s*\{[^}]*display:\s*none;[^}]*animation:\s*none;/s,
        );
        expect(stylesheet).toMatch(
            /\.diagram-root \.edge-selected-flow\s*\{[^}]*animation:\s*none;/s,
        );
    });

    it('keeps the floating drawer above the fixed minimap', () => {
        const drawerStylesheet = readRelativeFile('../IconRailSidebar.css');
        const minimapStylesheet = readRelativeFile('../../shared/FixedMiniMap.css');
        const drawerZIndex = Number(
            drawerStylesheet.match(/\.side-drawer\s*\{[\s\S]*?z-index:\s*(\d+);/)?.[1]
        );
        const minimapZIndex = Number(
            minimapStylesheet.match(/\.fixed-minimap-container\s*\{[\s\S]*?z-index:\s*(\d+);/)?.[1]
        );

        expect(drawerZIndex).toBeGreaterThan(minimapZIndex);
    });

    it('does not promote every node to a compositor layer during dragging', () => {
        const legacyStylesheet = readRelativeFile('../FlowchartDesigner.css');

        expect(legacyStylesheet).not.toMatch(
            /body\.performance-mode\s+\.react-flow__node\s*[,{\n]/,
        );
        expect(legacyStylesheet).toMatch(
            /\.react-flow\.performance-mode\s+\.react-flow__node\.dragging\s*\{[^}]*will-change:\s*transform;/s,
        );
    });

    it('never overrides React Flow node positioning transforms for hover effects', () => {
        const legacyStylesheet = readRelativeFile('../FlowchartDesigner.css');

        expect(legacyStylesheet).not.toMatch(
            /\.react-flow(?:\.performance-mode)?[^,{]*\.react-flow__node[^,{]*:hover\s*\{[^}]*transform:/s,
        );
        expect(legacyStylesheet).not.toMatch(
            /\.diagram-dragging[^,{]*\.react-flow__node[^,{]*:hover\s*\{[^}]*transform:/s,
        );
    });

    it('keeps highlighted container nodes in their React Flow stacking context', () => {
        const legacyStylesheet = readRelativeFile('../FlowchartDesigner.css');
        const highlightRule = legacyStylesheet.match(/\.drop-target-highlight\s*\{([^}]*)\}/s)?.[1] ?? '';

        expect(highlightRule).not.toMatch(/\bposition\s*:/);
        expect(highlightRule).not.toMatch(/\bz-index\s*:/);
    });

    it('disables inner-node animations for high-density canvases', () => {
        const globalStylesheet = readRelativeFile('../../../../main.css');

        expect(globalStylesheet).toMatch(
            /\[data-performance="high"\]\s+\.diagram-node-glass[^}]*transition:\s*none\s*!important;/s,
        );
        expect(globalStylesheet).toMatch(
            /\[data-performance="high"\]\s+\.diagram-node-selected[^}]*animation:\s*none\s*!important;/s,
        );
        expect(globalStylesheet).toMatch(
            /\[data-performance="high"\]\s+\.react-flow__handle[^}]*transition:\s*none\s*!important;/s,
        );
    });

    it('does not paint a second canvas edge layer underneath interactive SVG edges', () => {
        const baseReactFlowSource = readRelativeFile('../../shared/BaseReactFlow.tsx');

        expect(baseReactFlowSource).not.toContain('<CanvasEdgeLayer');
        expect(baseReactFlowSource).not.toContain("import CanvasEdgeLayer");
    });
});
