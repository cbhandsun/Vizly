import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  resolve(process.cwd(), 'src/core/components/diagrams/FlowchartVisualPolish.css'),
  'utf8',
);

const readSource = (relativePath: string): string => readFileSync(
  resolve(process.cwd(), 'src/core/components/custom-edges/__tests__', relativePath),
  'utf8',
);

describe('edge contrast paint CSS states', () => {
  it('keeps canonical paint immutable and uses a markerless trace for pointer or wrapper focus', () => {
    expect(stylesheet).toMatch(
      /\.shared-trunk-canonical-backbone\s*\{[^}]*stroke:\s*var\(--vizly-shared-canonical-stroke\)\s*!important;[^}]*opacity:\s*var\(--vizly-shared-canonical-opacity\)\s*!important;[^}]*filter:\s*none\s*!important;/s,
    );
    expect(stylesheet).toMatch(
      /\.react-flow__edge:is\(:hover, \.selected, :focus, :focus-visible\)[^{]*\.shared-trunk-accent-trace\s*\{[^}]*stroke:\s*var\(--flow-visual-accent\)\s*!important;[^}]*opacity:\s*1\s*!important;/s,
    );
    expect(stylesheet).toMatch(
      /\.react-flow__edge \.react-flow__edge-path\.shared-trunk-accent-trace\s*\{[^}]*transition:\s*none;/s,
    );
    expect(stylesheet).toContain("not(:has([data-shared-trunk-state='shared']))");
    expect(stylesheet).toContain(':not(.shared-trunk-canonical-backbone)');
    expect(stylesheet).toContain(':not(.shared-trunk-accent-trace)');
    expect(stylesheet).toContain(':not(.shared-trunk-junction)');
    expect(stylesheet).toContain(':not(.shared-trunk-junction-underlay)');
    expect(stylesheet).toMatch(
      /\.shared-trunk-semantic-fragment\s*\{[^}]*stroke:\s*var\(--vizly-shared-semantic-stroke\)\s*!important;[^}]*filter:\s*none\s*!important;/s,
    );
    expect(stylesheet).toMatch(
      /\.shared-trunk-junction\s*\{[^}]*stroke:\s*var\(--vizly-shared-junction-stroke\)\s*!important;[^}]*opacity:\s*1\s*!important;[^}]*pointer-events:\s*none\s*!important;/s,
    );
    expect(stylesheet).toMatch(
      /\.react-flow__edge:not\(:is\(:hover, \.selected, :focus, :focus-visible\)\)[^{]*\.react-flow__edge-path:not\(\.shared-trunk-canonical-backbone\)/s,
    );
    expect(stylesheet).toMatch(/transition:\s*opacity 80ms ease/);
    expect(stylesheet).toMatch(/--flow-visual-edge-peer-opacity:\s*1/);
    expect(stylesheet).not.toMatch(/--flow-visual-edge-peer-opacity:\s*0\.[0-9]+/);
    expect(stylesheet).not.toMatch(/\.react-flow__edge\s*\{[^}]*opacity:\s*0\.42/s);
  });

  it('outlines marker-only carriers without creating a visible line or changing marker definitions', () => {
    expect(stylesheet).toContain('.vizly-edge-contrast-marker-outline--dark');
    expect(stylesheet).toContain('var(--vizly-edge-marker-outline-color, #334155)');
    expect(stylesheet).toContain('.vizly-edge-contrast-marker-outline--light');
    expect(stylesheet).toContain('var(--vizly-edge-marker-outline-color, #f8fafc)');
    expect(stylesheet).toMatch(
      /\.shared-trunk-terminal-marker-carrier\s*\{[^}]*stroke:\s*transparent\s*!important;[^}]*opacity:\s*1\s*!important;[^}]*pointer-events:\s*none\s*!important;/s,
    );
    expect(stylesheet).not.toMatch(
      /\.vizly-edge-contrast-marker-outline[^}]*\bstroke\s*:/s,
    );
    expect(stylesheet).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.vizly-edge-contrast-underlay\s*\{[^}]*stroke:\s*CanvasText\s*!important;/s,
    );
  });

  it('routes both stable and advanced SVG foregrounds through the same paint-only boundary', () => {
    const stableSource = readSource('../StablePathEdge.tsx');
    const advancedSource = readSource('../renderers/AdvancedSmartEdgeGraphics.tsx');

    expect(stableSource).toContain('<ContrastSafeBaseEdge');
    expect(advancedSource).toContain('<ContrastSafeBaseEdge');
    expect(stableSource).not.toContain('<BaseEdge');
    expect(stableSource).toContain("'shared-trunk-terminal-marker-carrier'");
    expect(stableSource).toContain("stroke: 'transparent'");
    expect(stableSource).toContain('interactionWidth={0}');
    expect(stableSource).toContain('className="react-flow__edge-interaction shared-trunk-edge-interaction"');
    expect(stableSource).toContain('resolveEdgeContrastPaint({');
    expect(advancedSource).not.toContain('<BaseEdge');
  });
});
