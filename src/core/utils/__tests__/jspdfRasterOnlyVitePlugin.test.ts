import { describe, expect, it } from 'vitest';
import { stripUnusedJspdfOptionalImports } from '../../../../vite-plugins/jspdfRasterOnly';

const JSPDF_BROWSER_MODULE = 'C:\\repo\\node_modules\\jspdf\\dist\\jspdf.es.min.js';

describe('jsPDF raster-only Vite transform', () => {
  it('removes only jsPDF optional HTML and SVG dependency imports', () => {
    const source = [
      'const html = () => import("html2canvas");',
      "const purifier = () => import('dompurify');",
      'const svg = () => import("canvg");',
      'export const keep = () => import("another-package");',
    ].join('\n');

    const result = stripUnusedJspdfOptionalImports(source, JSPDF_BROWSER_MODULE);

    expect(result?.code).not.toContain('import("html2canvas")');
    expect(result?.code).not.toContain("import('dompurify')");
    expect(result?.code).not.toContain('import("canvg")');
    expect(result?.code).toContain('import("another-package")');
    expect(result?.code.match(/jsPDF optional .* integration is not bundled by Vizly/g)).toHaveLength(3);
  });

  it('does not transform application imports with the same package names', () => {
    const source = 'export const load = () => import("dompurify");';

    expect(stripUnusedJspdfOptionalImports(source, 'C:/repo/src/sanitize.ts')).toBeNull();
  });

  it('fails closed when the upstream jsPDF optional import surface changes', () => {
    const incompleteSource = [
      'const html = () => import("html2canvas");',
      'const svg = () => import("canvg");',
    ].join('\n');

    expect(() => stripUnusedJspdfOptionalImports(incompleteSource, JSPDF_BROWSER_MODULE)).toThrow(
      /Expected jsPDF optional imports/,
    );
  });
});
