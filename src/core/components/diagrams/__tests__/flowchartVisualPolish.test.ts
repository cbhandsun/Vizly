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
        expect(stylesheet).toContain(
            ".diagram-root .react-flow__edge.selected:not(:has([data-shared-trunk-state='shared']))",
        );
        expect(stylesheet).toContain('.diagram-root .edge-label-premium');
        expect(stylesheet).toContain('.diagram-root .stable-path-edge-label');
        expect(stylesheet).toContain("[data-theme='dark'] .diagram-root");
        expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('keeps legacy custom-node handles measurable without painting stacked ghost ports', () => {
        const stylesheet = readRelativeFile('../FlowchartVisualPolish.css');
        const customNodeGraphics = readRelativeFile(
            '../../custom-nodes/renderers/CustomNodeGraphics.tsx',
        );

        expect(customNodeGraphics).toContain("'custom-node-handle-primary'");
        expect(customNodeGraphics).toContain("'custom-node-handle-compatibility'");
        expect(customNodeGraphics.lastIndexOf('className={primaryHandleClassName}')).toBeGreaterThan(
            customNodeGraphics.lastIndexOf('className={compatibilityHandleClassName}'),
        );
        expect(stylesheet).toMatch(
            /\.react-flow\.connecting[^{]*\.custom-node-handle-compatibility\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;[^}]*opacity:\s*0\s*!important;/s,
        );
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

    it('keeps the floating drawer above the fixed minimap and positioned node toolbar', () => {
        const drawerStylesheet = readRelativeFile('../IconRailSidebar.css');
        const minimapStylesheet = readRelativeFile('../../shared/FixedMiniMap.css');
        const toolbarStylesheet = readRelativeFile('../../shared/FloatingToolbar/FloatingToolbar.css');
        const drawerZIndex = Number(
            drawerStylesheet.match(/\.side-drawer\s*\{[\s\S]*?z-index:\s*(\d+);/)?.[1]
        );
        const minimapZIndex = Number(
            minimapStylesheet.match(/\.fixed-minimap-container\s*\{[\s\S]*?z-index:\s*(\d+);/)?.[1]
        );
        const toolbarZIndex = Number(
            toolbarStylesheet.match(/\.floating-toolbar-container--positioned\s*\{[\s\S]*?z-index:\s*(\d+);/)?.[1]
        );

        expect(drawerZIndex).toBeGreaterThan(minimapZIndex);
        expect(drawerZIndex).toBeGreaterThan(toolbarZIndex);
    });

    it('suppresses the selected-node toolbar while a left drawer is open', () => {
        const viewSource = readRelativeFile('../FlowchartDesignerView.tsx');

        expect(viewSource).toContain(
            'isContextToolbarHidden: isContextToolbarHidden || Boolean(leftDrawerOpen)',
        );
    });

    it('applies a low-zoom label budget with explicit main-route and trace restoration', () => {
        const legacyStylesheet = readRelativeFile('../FlowchartDesigner.css');

        expect(legacyStylesheet).toContain('.diagram-zoomed-out .stable-path-edge-label');
        expect(legacyStylesheet).toContain('.diagram-zoomed-out .vizly-edge-label');
        expect(legacyStylesheet).not.toMatch(
            /\.diagram-zoomed-out \.react-flow__edge-path\s*\{[^}]*stroke-dasharray:\s*none/s,
        );
        expect(legacyStylesheet).toContain('.stable-path-edge-label--primary');
        expect(legacyStylesheet).toContain('.stable-path-edge-label--trace-active');
        expect(legacyStylesheet).toMatch(
            /\.diagram-zoomed-out \.stable-path-edge-label:is\([\s\S]*?:focus-visible[\s\S]*?\)\s*\{[^}]*display:\s*block\s*!important;/s,
        );
    });

    it('gives hover, selection, and focus a non-color trace hierarchy', () => {
        const stylesheet = readRelativeFile('../FlowchartVisualPolish.css');
        const legacyStylesheet = readRelativeFile('../FlowchartDesigner.css');

        expect(stylesheet).toContain(
            '.diagram-root:has(.react-flow__edge:is(:hover, .selected, :focus-visible))',
        );
        expect(stylesheet).toMatch(
            /:has\(\.react-flow__edge:is\(:hover, \.selected, :focus-visible\)\)[\s\S]*?\.react-flow__edge-path:not\(\.shared-trunk-canonical-backbone\)[\s\S]*?\{[^}]*opacity:\s*var\(--flow-visual-edge-peer-opacity\)/s,
        );
        expect(stylesheet).toMatch(
            /\.react-flow__edge:hover:not\(:has\(\[data-shared-trunk-state='shared'\]\)\)[\s\S]*?\.react-flow__edge-path\s*\{[^}]*stroke-width:\s*var\(--flow-visual-edge-hover-width\)\s*!important;/s,
        );
        expect(stylesheet).toMatch(
            /\.react-flow__edge\.selected:not\(:has\(\[data-shared-trunk-state='shared'\]\)\)[\s\S]*?\.react-flow__edge-path\s*\{[^}]*stroke-width:\s*var\(--flow-visual-edge-selected-width\)\s*!important;/s,
        );
        expect(stylesheet).toMatch(
            /\.shared-trunk-canonical-backbone\s*\{[^}]*stroke:\s*var\(--vizly-shared-canonical-stroke\)\s*!important;[^}]*opacity:\s*var\(--vizly-shared-canonical-opacity\)\s*!important;[^}]*filter:\s*none\s*!important;/s,
        );
        expect(stylesheet).toContain('.stable-path-edge-label--trace-active');
        expect(stylesheet).toMatch(
            /\.stable-path-edge-terminal\s*\{[^}]*fill:\s*rgba\(255, 255, 255, 0\.92\);[^}]*stroke:\s*var\(--flow-visual-accent\);[^}]*stroke-width:\s*1\.75px;/s,
        );
        expect(stylesheet).toMatch(
            /\.stable-path-edge-label:focus-visible\s*\{[^}]*outline:\s*2px solid/s,
        );
        expect(legacyStylesheet).not.toMatch(
            /\.react-flow__edge,\s*\.react-flow__edge\.selected\s*\{[^}]*z-index:\s*0\s*!important;/s,
        );
    });

    it('uses a compact, stable commercial label treatment without blur or border reflow', () => {
        const stylesheet = readRelativeFile('../FlowchartVisualPolish.css');

        expect(stylesheet).toMatch(
            /\.diagram-root \.stable-path-edge-label\s*\{[^}]*border-radius:\s*4px;[^}]*font-size:\s*11px;/s,
        );
        expect(stylesheet).not.toMatch(/\.stable-path-edge-label\s*\{[^}]*backdrop-filter:/s);
        expect(stylesheet).toMatch(
            /\.stable-path-edge-label:is\([\s\S]*?\)\s*\{[^}]*border-width:\s*1px;[^}]*font-weight:\s*650;/s,
        );
    });

    it('keeps idle edge paint opaque and gives unstyled stable edges a compliant fallback', () => {
        const stylesheet = readRelativeFile('../FlowchartVisualPolish.css');

        expect(stylesheet).toMatch(
            /\.diagram-root \.react-flow__edge-path\s*\{[^}]*opacity:\s*1;/s,
        );
        expect(stylesheet).toMatch(
            /\[data-theme='dark'\] \.diagram-root \.react-flow__edge-path\s*\{[^}]*opacity:\s*1;/s,
        );
        expect(stylesheet).toMatch(
            /\.react-flow__edge-stablePath \.react-flow__edge-path:not\(\[style\*='stroke:'\]\)\s*\{[^}]*stroke:\s*#64748b;[^}]*stroke-width:\s*1\.5px;[^}]*opacity:\s*1;/s,
        );
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

    it('keeps the controlled property drawer available on mobile', () => {
        const legacyStylesheet = readRelativeFile('../FlowchartDesigner.css');

        expect(legacyStylesheet).not.toMatch(
            /\.designer-right-sidebar\s*\{[^}]*display:\s*none\s*!important;/s,
        );
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
