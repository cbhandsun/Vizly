import type { Plugin } from 'vite';

const JSPDF_BROWSER_BUNDLE = /\/node_modules\/jspdf\/dist\/jspdf\.es(?:\.min)?\.js(?:\?.*)?$/;
const JSPDF_OPTIONAL_IMPORT = /\bimport\(\s*(['"])(html2canvas|dompurify|canvg)\1\s*\)/g;
const EXPECTED_OPTIONAL_DEPENDENCIES = new Set([
  'html2canvas',
  'dompurify',
  'canvg',
]);

const normalizedModuleId = (id: string) => id.replace(/\\/g, '/');

/**
 * jsPDF ships its HTML and SVG-to-canvas integrations in the main browser
 * module. Their literal dynamic imports make Rollup emit the optional
 * html2canvas, DOMPurify, and canvg dependency trees even when an application
 * only uses addImage(), as Vizly does.
 *
 * Keep the raster PDF surface intact and replace only those unused optional
 * loaders. The exact dependency assertion intentionally fails the build after
 * an upstream jsPDF layout change instead of silently restoring the large
 * optional chunks.
 */
export const stripUnusedJspdfOptionalImports = (
  code: string,
  id: string,
): { code: string; map: null } | null => {
  if (!JSPDF_BROWSER_BUNDLE.test(normalizedModuleId(id))) {
    return null;
  }

  const replacedDependencies = new Set<string>();
  const transformedCode = code.replace(
    JSPDF_OPTIONAL_IMPORT,
    (_match, _quote: string, dependency: string) => {
      replacedDependencies.add(dependency);
      return `Promise.reject(new Error("jsPDF optional ${dependency} integration is not bundled by Vizly"))`;
    },
  );

  const hasExpectedDependencies =
    replacedDependencies.size === EXPECTED_OPTIONAL_DEPENDENCIES.size &&
    [...EXPECTED_OPTIONAL_DEPENDENCIES].every((dependency) => replacedDependencies.has(dependency));

  if (!hasExpectedDependencies) {
    throw new Error(
      `[vizly:jspdf-raster-only] Expected jsPDF optional imports for ${[
        ...EXPECTED_OPTIONAL_DEPENDENCIES,
      ].join(', ')}, found ${[...replacedDependencies].join(', ') || 'none'}`,
    );
  }

  return {
    code: transformedCode,
    map: null,
  };
};

export const jspdfRasterOnlyPlugin = (): Plugin => ({
  name: 'vizly:jspdf-raster-only',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    return stripUnusedJspdfOptionalImports(code, id);
  },
});
