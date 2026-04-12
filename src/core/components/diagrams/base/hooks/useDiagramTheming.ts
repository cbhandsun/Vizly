import { useMemo, useCallback, useSyncExternalStore } from 'react';
import type { Node } from '@xyflow/react';
import { useConfigIntegration } from '../../../../hooks/useConfigIntegration';
import { resolveThemeDomainKey, getDomainTheme } from '../../../../utils/domainKey';
import { pickReadableTextColor } from '../../../../utils/colorUtils';

const hexToRgba = (hex: string, alpha: number): string => {
  if (!hex || !/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    return `rgba(200, 200, 200, ${alpha})`;
  }
  let c: string[] = hex.substring(1).split('');
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  const num = parseInt(c.join(''), 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
};

type DomainColor = {
  main?: string;
  light?: string;
  border?: string;
  background?: string;
  text?: string;
};

export interface DiagramThemingParams {
  rfNodes: Node[];
  resolvedNodesDraggable: boolean;
}

export function useDiagramTheming({ rfNodes, resolvedNodesDraggable }: DiagramThemingParams) {
  const [integrationState] = useConfigIntegration();

  const theme = useSyncExternalStore(
    useCallback((onStoreChange) => {
      const themeManager = integrationState.integration?.getThemeManager?.();
      if (!integrationState.isReady || !themeManager) return () => { };
      return themeManager.addThemeChangeListener(() => onStoreChange());
    }, [integrationState.integration, integrationState.isReady]),
    useCallback(() => {
      const themeManager = integrationState.integration?.getThemeManager?.();
      if (!integrationState.isReady || !themeManager) return null;
      return themeManager.getCurrentTheme() || null;
    }, [integrationState.integration, integrationState.isReady]),
    () => null
  );

  const themedNodes = useMemo(() => {
    if (!theme) return rfNodes;

    const computeLayerStyle = (layer: string | undefined, color: DomainColor): React.CSSProperties => {
      const main = color?.main || '#4A90E2';
      const border = color?.border || main;
      switch (layer) {
        case 'CORE_CENTER':
          return {
            border: `2.5px solid ${border}`,
            boxShadow: `0 14px 36px ${hexToRgba(main, 0.28)}, 0 0 0 4px ${hexToRgba(main, 0.18)}`,
            zIndex: 50
          };
        case 'WING_SUPPORT':
          return {
            border: `2px solid ${hexToRgba(border, 0.75)}`,
            boxShadow: `0 8px 22px ${hexToRgba(main, 0.18)}`
          };
        case 'INPUT':
          return {
            border: `2px dashed ${hexToRgba(border, 0.7)}`,
            boxShadow: `0 6px 18px ${hexToRgba(main, 0.15)}`
          };
        case 'ORCHESTRATION':
          return {
            border: `2px solid ${hexToRgba(border, 0.7)}`,
            boxShadow: `0 10px 26px ${hexToRgba(main, 0.22)}`
          };
        case 'OUTPUT':
          return {
            border: `2px solid ${hexToRgba(border, 0.65)}`,
            boxShadow: `0 6px 18px ${hexToRgba(main, 0.15)}`
          };
        default:
          return {
            border: `2px solid ${hexToRgba(border, 0.6)}`,
            boxShadow: `0 4px 12px ${hexToRgba(main, 0.12)}`
          };
      }
    };

    const domains = (theme.diagram?.domains ?? {}) as Record<string, DomainColor>;
    const fallbackDomain =
      domains['frontend'] ??
      Object.values(domains)[0] ??
      ((theme.diagram?.nodes?.default ?? {
        main: '#4A90E2',
        light: '#EAF2FD',
        border: '#3A7BD5',
        background: '#FFFFFF'
      }) as DomainColor);

    const composeDomainColorWithText = (color: DomainColor): DomainColor => {
      if (color.text) return color;
      const bg = color.background || color.light || color.main;
      const text = pickReadableTextColor(bg || '#FFFFFF', '#FFFFFF', '#111111');
      return { ...color, text };
    };

    return rfNodes.map(n => {
      const data = ((n.data ?? {}) as Record<string, unknown>);
      const domainClass = (data.domainClass as string | undefined);
      const layer = (data.layer as string | undefined);
      const domainKey = resolveThemeDomainKey(theme, { domainClass });

      let domainColor: DomainColor | undefined = getDomainTheme(theme, { domainClass }) as unknown as DomainColor | undefined;
      if (!domainColor && domainKey !== 'frontend') {
        domainColor = domains['frontend'];
      }
      if (!domainColor) {
        domainColor = fallbackDomain;
      }

      const enhancedDomainColor = composeDomainColorWithText(domainColor);
      const baseCustomStyle = (data.customStyle as React.CSSProperties | undefined) ?? undefined;
      const customStyle = {
        ...(baseCustomStyle || {}),
        ...computeLayerStyle(layer, enhancedDomainColor)
      };

      return {
        ...n,
        draggable: resolvedNodesDraggable,
        data: {
          ...data,
          theme: enhancedDomainColor,
          customStyle
        }
      };
    });
  }, [rfNodes, theme, resolvedNodesDraggable]);

  return { theme, themedNodes };
}
