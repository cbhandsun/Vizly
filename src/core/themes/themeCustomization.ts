import type { Theme } from './types/ThemeTypes';
import type { ThemeTemplate } from './themePresetCatalog';

export const applyThemeCustomizations = (
  baseTheme: Theme,
  customizations: ThemeTemplate['customizations'],
): Theme => ({
  ...baseTheme,
  palette: {
    ...baseTheme.palette,
    ...customizations.palette,
  },
  typography: {
    ...baseTheme.typography,
    ...customizations.typography,
    fontFamily: {
      ...baseTheme.typography.fontFamily,
      ...customizations.typography?.fontFamily,
    },
    fontSize: {
      ...baseTheme.typography.fontSize,
      ...customizations.typography?.fontSize,
    },
    fontWeight: {
      ...baseTheme.typography.fontWeight,
      ...customizations.typography?.fontWeight,
    },
    lineHeight: {
      ...baseTheme.typography.lineHeight,
      ...customizations.typography?.lineHeight,
    },
  },
  spacing: { ...baseTheme.spacing, ...customizations.spacing },
  borderRadius: { ...baseTheme.borderRadius, ...customizations.borderRadius },
  shadow: { ...baseTheme.shadow, ...customizations.shadow },
  animation: {
    ...baseTheme.animation,
    ...customizations.animation,
    duration: {
      ...baseTheme.animation.duration,
      ...customizations.animation?.duration,
    },
    easing: {
      ...baseTheme.animation.easing,
      ...customizations.animation?.easing,
    },
  },
  diagram: {
    ...baseTheme.diagram,
    domains: {
      ...baseTheme.diagram.domains,
      ...customizations.diagram?.domains,
    },
    edges: {
      ...baseTheme.diagram.edges,
      ...customizations.diagram?.edges,
    },
    nodes: {
      ...baseTheme.diagram.nodes,
      ...customizations.diagram?.nodes,
    },
    canvas: {
      ...baseTheme.diagram.canvas,
      ...customizations.diagram?.canvas,
      grid: {
        ...baseTheme.diagram.canvas.grid,
        ...customizations.diagram?.canvas?.grid,
      },
    },
  },
});
