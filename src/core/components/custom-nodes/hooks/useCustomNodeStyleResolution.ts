import { useMemo } from 'react';
import { useTheme } from '../../../themes/useCoreTheme';
import { getDomainTheme, resolveThemeDomainKey } from '../../../utils/domainKey';
import { pickReadableTextColor, ensureReadableText } from '../../../utils/colorUtils';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { useDiagramStylePreset } from '../../shared/DiagramStyleManager';

const DEFAULT_FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';

const hexToRgba = (hex: string, alpha: number): string => {
    if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        return `rgba(200, 200, 200, ${alpha})`;
    }
    let c: string[] = hex.substring(1).split('');
    if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    const num = parseInt(c.join(''), 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
};

export interface UseCustomNodeStyleResolutionProps {
    id: string;
    data: any;
    selected: boolean;
    hovered: boolean;
    nodeWidth?: number;
}

export const useCustomNodeStyleResolution = ({
    id,
    data: d,
    selected,
    hovered,
    nodeWidth
}: UseCustomNodeStyleResolutionProps) => {
    const [theme] = useTheme({ autoInitialize: true });
    const preset = useDiagramStylePreset();

    // Debug checks
    const debugEnabled = useMemo(() => {
        try {
            const search = typeof window !== 'undefined' ? window.location.search : '';
            const qs = new URLSearchParams(search);
            return qs.get('themeDebug') === '1' || 
                   (typeof window !== 'undefined' && localStorage.getItem('diagram-theme-debug') === 'true');
        } catch {
            return false;
        }
    }, []);

    // Theme & Domain resolution
    const domainKey = resolveThemeDomainKey(theme, { domainClass: d?.domainClass });
    const domainTheme = getDomainTheme(theme, { domainClass: d?.domainClass });

    const themeBorderRaw = domainTheme?.border || d.theme?.border || '#9E9E9E';
    const themeMainRaw = domainTheme?.main || d.theme?.main || d.theme?.border || '#9E9E9E';
    const themeBorder = preset?.name === 'mono' ? '#111111' : themeBorderRaw;
    const themeMain = preset?.name === 'mono' ? '#111111' : themeMainRaw;
    
    const themeBackground =
        domainTheme?.background ||
        domainTheme?.light ||
        domainTheme?.main ||
        d.theme?.background ||
        d.theme?.light ||
        d.theme?.main;

    const zIndex = (d.baseZIndex || 2) + (selected ? 100 : 0);

    // Font configurations
    const configuredFontSize = useMemo(() => {
        try {
            return diagramConfigManager.getConfig()?.node?.font?.size ?? 16;
        } catch {
            return 16;
        }
    }, []);

    const effectiveFontFamily = useMemo(() => {
        try {
            return (d?.fontFamily as string) || (diagramConfigManager.getConfig()?.node?.font?.family as string) || DEFAULT_FONT_STACK;
        } catch {
            return (d?.fontFamily as string) || DEFAULT_FONT_STACK;
        }
    }, [d?.fontFamily]);

    const finalFontSize = typeof d.fontSize === 'number'
        ? d.fontSize
        : (d.fontSize ? parseInt(String(d.fontSize), 10) : configuredFontSize);

    // Padding calculations
    const accent = preset?.node?.accentBar;
    const basePadH = d?.padding?.horizontal ?? 16;
    const basePadV = d?.padding?.vertical ?? 12;
    const extraPadH = accent && accent.position === 'left' ? (accent.width + 8) : 0;
    const extraPadV = accent && accent.position === 'top' ? (accent.width + 8) : 0;
    const finalPadH = basePadH + extraPadH;
    const finalPadV = basePadV + extraPadV;

    // Background & Borders
    const isDarkTheme = (theme as any)?.name === 'dark' || (theme as any)?.mode === 'dark';
    const hasExplicitDomainColor = !!(d?.domainClass && domainTheme?.background) || !!d?.theme?.background;
    const bgPolicy = preset?.node?.backgroundPolicy ?? 'theme';
    const radiusToken = preset?.node?.radius ?? 16;

    const tintBackground = hexToRgba(themeMain, 0.08);
    const tintGradient = `linear-gradient(135deg, ${hexToRgba(themeMain, 0.06)} 0%, ${hexToRgba(themeMain, 0.12)} 100%)`;

    const getBackgroundColor = () => {
        if (selected) return hexToRgba(themeMain, 0.06);
        if (bgPolicy === 'white' && !hasExplicitDomainColor) return '#FFFFFF';
        if (bgPolicy === 'tint') return tintBackground;
        return themeBackground || 'transparent';
    };

    const safeCustomStyle = { ...(d.customStyle || {}) } as React.CSSProperties;
    if ('backgroundColor' in safeCustomStyle) delete (safeCustomStyle as any).backgroundColor;
    if ('border' in safeCustomStyle) delete (safeCustomStyle as any).border;
    if ('borderColor' in safeCustomStyle) delete (safeCustomStyle as any).borderColor;

    // Text Contrast Resolution
    const resolveContentTextColor = (customColor?: string, bgColor?: string) => {
        if (customColor) return ensureReadableText(customColor, String(bgColor || '#FFFFFF'));
        const nodeThemeText = d?.theme?.text as string | undefined;
        if (nodeThemeText) return ensureReadableText(nodeThemeText, String(bgColor || '#FFFFFF'));
        const domainText = domainTheme?.text;
        if (domainText) return ensureReadableText(domainText, String(bgColor || '#FFFFFF'));
        const nodeDefaultText = theme?.diagram?.nodes?.default?.text;
        if (nodeDefaultText) return ensureReadableText(nodeDefaultText, String(bgColor || '#FFFFFF'));
        const neutralText = theme?.palette?.neutral?.text;
        if (neutralText) return ensureReadableText(neutralText, String(bgColor || '#FFFFFF'));
        
        if (bgColor) return pickReadableTextColor(bgColor, '#FFFFFF', '#111111');
        return '#111111';
    };

    const textColor = resolveContentTextColor(d?.customStyle?.color, themeBackground);

    // --- Computed Styles Objects ---
    const containerStyle: React.CSSProperties = {
        width: '100%', 
        height: '100%',
        maxWidth: nodeWidth ? `${nodeWidth}px` : undefined,
        border: selected ? `1px solid ${themeMain}` : `1px solid ${hexToRgba(themeBorder, 0.35)}`,
        borderRadius: `${radiusToken}px`,
        overflow: 'hidden',
        backgroundColor: getBackgroundColor(),
        boxShadow: selected
            ? `0 0 0 3px ${hexToRgba(themeMain, 0.12)}, 0 4px 12px -2px rgba(0, 0, 0, 0.1)`
            : (hovered ? `0 2px 8px -1px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06)` : `0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)`),
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        padding: `${finalPadV}px ${finalPadH}px`, 
        boxSizing: 'border-box',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, transform 0.15s ease',
        position: 'relative', 
        zIndex,
        cursor: 'move',
        userSelect: 'none',
        touchAction: 'none',
        backgroundImage: !selected && bgPolicy === 'tint' ? tintGradient : 'none',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...safeCustomStyle
    };

    const contentStyle: React.CSSProperties = {
        color: textColor,
        textAlign: 'left',
        fontFamily: effectiveFontFamily,
        fontWeight: d?.fontWeight ?? '400',
        lineHeight: d?.lineHeight ?? 1.4,
        fontSize: `${finalFontSize}px`,
        whiteSpace: 'nowrap',
        wordBreak: 'keep-all',
        overflowWrap: 'normal',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '8px',
    };

    const textContainerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        textAlign: 'left',
        height: '100%',
        flex: 1,
        minWidth: 0,
    };

    const getLineStyle = (line: string): React.CSSProperties => {
        const isBullet = /^\s*(•|-|·|\u2022)/.test(line || '') || /^\s*<li[\s>]/i.test(line || '');
        if (isBullet) {
            return {
                whiteSpace: 'nowrap',
                wordBreak: 'keep-all',
                overflowWrap: 'normal',
                overflow: 'visible',
                textOverflow: 'clip',
                display: 'block',
                width: '100%',
                minWidth: 0,
            };
        }
        return {
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            overflow: 'visible',
            textOverflow: 'clip',
            display: 'block',
            width: '100%',
            minWidth: 0,
        };
    };

    // --- Accessory Props Calculators ---
    const getAccentBarProps = () => {
        if (!accent) return null;
        const roleScale = (() => {
            const dk = String(d?.domain || '').toLowerCase();
            if (dk === 'core') return 1.3;
            if (dk === 'strategy') return 1.1;
            if (dk === 'data') return 0.9;
            return 1.0;
        })();
        const widthPx = Math.round((accent.width || 6) * roleScale * (selected ? 1.15 : hovered ? 1.1 : 1));
        const baseAlpha = Math.max(0, Math.min(1, (accent.alpha ?? 0.3) * (selected ? 1.25 : hovered ? 1.15 : 1)));
        const solidColor = hexToRgba(themeMain, baseAlpha);
        
        const gradient = `linear-gradient(${accent.position === 'left' ? '180deg' : '90deg'}, ${hexToRgba(themeMain, baseAlpha + 0.1)} 0%, ${hexToRgba(themeMain, Math.max(0, baseAlpha - 0.1))} 100%)`;
        const dashed = accent.position === 'left'
            ? `repeating-linear-gradient(180deg, ${solidColor} 0px, ${solidColor} 6px, transparent 6px, transparent 12px)`
            : `repeating-linear-gradient(90deg, ${solidColor} 0px, ${solidColor} 6px, transparent 6px, transparent 12px)`;
        const background = accent.variant === 'gradient' ? gradient : (accent.variant === 'dashed' ? dashed : solidColor);
        
        const style: React.CSSProperties = accent.position === 'left'
            ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${widthPx}px`, background, borderTopLeftRadius: `${radiusToken}px`, borderBottomLeftRadius: `${radiusToken}px`, pointerEvents: 'none' }
            : { position: 'absolute', left: 0, right: 0, top: 0, height: `${widthPx}px`, background, borderTopLeftRadius: `${radiusToken}px`, borderTopRightRadius: `${radiusToken}px`, pointerEvents: 'none' };
        
        return style;
    };

    const getStatusStripeProps = () => {
        const stripe = preset?.node?.statusStripe;
        if (!stripe || accent) return null; // mutually exclusive
        const kind = String(d?.status || d?.statusKind || '').toLowerCase();
        
        const colorMap: Record<string, string> = {
            success: '#22c55e', ok: '#22c55e',
            warning: '#f59e0b', warn: '#f59e0b',
            danger: '#ef4444', error: '#ef4444',
            pending: '#64748b',
        };
        const baseColor = colorMap[kind] || themeMain;
        const alpha = Math.max(0, Math.min(1, stripe.alpha ?? 0.3));
        
        return {
            position: 'absolute', left: 0, right: 0, top: 0,
            height: `${Math.max(2, stripe.height || 3)}px`,
            background: hexToRgba(baseColor, alpha),
            borderTopLeftRadius: `${radiusToken}px`,
            borderTopRightRadius: `${radiusToken}px`,
            pointerEvents: 'none',
        } as React.CSSProperties;
    };

    return {
        // Flags
        debugEnabled,
        // Computed values
        domainKey,
        themeMain,
        themeBorder,
        // Styles
        containerStyle,
        contentStyle,
        textContainerStyle,
        getLineStyle,
        accentBarProps: getAccentBarProps(),
        statusStripeProps: getStatusStripeProps(),
    };
};
