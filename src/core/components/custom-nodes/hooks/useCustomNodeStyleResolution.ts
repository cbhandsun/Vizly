import { useMemo } from 'react';
import { useTheme } from '../../../themes/useCoreTheme';
import { getDomainTheme, resolveThemeDomainKey } from '../../../utils/domainKey';
import { ensureReadableText } from '../../../utils/colorUtils';
import { diagramConfigManager } from '@/core/config/DiagramConfig';
import { useDiagramStylePreset_v2 } from '../../../hooks/useDiagramStylePreset_v2';
import { getQueryOrHashParamFromLocation } from '../../../utils/inputBoundary';

const DEFAULT_FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * 基于 domainClass 的语义图标映射（轻量 emoji 方案，零依赖）
 * 支持通用架构词汇 + WMS/物流行业词汇
 */
const DOMAIN_CLASS_ICON_MAP: Record<string, string> = {
    // 通用语义类
    'core':         '⚙️',
    'system':       '🖥️',
    'external':     '🌐',
    'decision':     '🔀',
    'support':      '🔧',
    'data':         '🗄️',
    'api':          '🔗',
    'service':      '⚡',
    'gateway':      '🚪',
    'queue':        '📬',
    'cache':        '⚡',
    'auth':         '🔐',
    'ui':           '🖼️',
    'fe':           '🖼️',
    'frontend':     '🖼️',
    'backend':      '⚙️',
    'be':           '⚙️',
    'database':     '🗄️',
    'db':           '🗄️',
    'storage':      '💾',
    'cloud':        '☁️',
    'monitor':      '📊',
    'log':          '📋',
    'user':         '👤',
    'client':       '💻',
    'mobile':       '📱',
    // WMS/物流行业词汇
    'wms':          '📦',
    'tms':          '🚛',
    'oms':          '🛒',
    'wcs':          '🏭',
    'erp':          '🏢',
    'scm':          '🔄',
    'be-scm':       '🔄',
    'be-logistics': '🚛',
    'ch':           '📡',
    'channel':      '📡',
    'logistics':    '🚛',
    'warehouse':    '🏭',
    'inbound':      '📥',
    'outbound':     '📤',
    'inventory':    '📦',
    'order':        '🛒',
    'shipping':     '🚢',
    'delivery':     '🚚',
    'supplier':     '🏗️',
    'customer':     '👥',
};

/** 基于节点描述文本中的关键词推断图标（兜底机制） */
const inferIconFromLabel = (label: string): string | null => {
    const lower = label.toLowerCase();
    const KEYWORD_ICONS: Array<[string[], string]> = [
        [['api', 'gateway', '网关'],       '🚪'],
        [['queue', 'kafka', 'mq', '消息'],  '📬'],
        [['cache', 'redis', '缓存'],         '⚡'],
        [['database', 'mysql', 'db', '数据库'], '🗄️'],
        [['order', '订单'],                  '🛒'],
        [['warehouse', '仓库', '仓储'],      '🏭'],
        [['logistics', '物流'],              '🚛'],
        [['user', '用户', 'customer'],       '👤'],
        [['monitor', '监控', '运维'],        '📊'],
        [['auth', '认证', '权限'],           '🔐'],
        [['cloud', '云'],                    '☁️'],
        [['mobile', '移动', '小程序', '微信'], '📱'],
        [['report', '报表', '统计'],         '📋'],
        [['ai', 'ml', '智能'],              '🤖'],
        [['payment', '支付', '结算'],        '💳'],
        [['inventory', '库存'],              '📦'],
        [['schedule', '调度', '定时'],       '⏱️'],
        [['service', '服务'],                '⚙️'],
    ];
    for (const [keywords, icon] of KEYWORD_ICONS) {
        if (keywords.some(kw => lower.includes(kw))) return icon;
    }
    return null;
};

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

const mixHexOverBase = (hex: string, amount: number, base: [number, number, number]): string => {
    if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        return `color-mix(in srgb, ${hex} ${Math.round(amount * 100)}%, rgb(${base.join(', ')}) ${Math.round((1 - amount) * 100)}%)`;
    }
    let c: string[] = hex.substring(1).split('');
    if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    const num = parseInt(c.join(''), 16);
    const fg: [number, number, number] = [
        (num >> 16) & 255,
        (num >> 8) & 255,
        num & 255,
    ];
    const mixed = fg.map((channel, index) => Math.round(channel * amount + base[index] * (1 - amount)));
    return `rgb(${mixed.join(', ')})`;
};

export interface UseCustomNodeStyleResolutionProps {
    id: string;
    data: any;
    selected: boolean;
    hovered: boolean;
    nodeWidth?: number;
}

export const useCustomNodeStyleResolution = ({
    _id,
    data: d,
    selected,
    hovered,
    nodeWidth
}: UseCustomNodeStyleResolutionProps) => {
    const [theme] = useTheme({ autoInitialize: true });
    const preset = useDiagramStylePreset_v2();

    // Debug checks
    const debugEnabled = useMemo(() => {
        try {
            const fromUrl = getQueryOrHashParamFromLocation(
                typeof window === 'undefined' ? undefined : window.location,
                'themeDebug'
            ) === '1';
            return fromUrl ||
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

    const opaqueBase: [number, number, number] = isDarkTheme ? [30, 34, 51] : [255, 255, 255];
    const tintBackground = mixHexOverBase(themeMain, isDarkTheme ? 0.12 : 0.09, opaqueBase);
    const selectedTintBackground = mixHexOverBase(themeMain, isDarkTheme ? 0.16 : 0.11, opaqueBase);
    const tintGradient = `linear-gradient(160deg, ${mixHexOverBase(themeMain, isDarkTheme ? 0.10 : 0.06, opaqueBase)} 0%, ${mixHexOverBase(themeMain, isDarkTheme ? 0.18 : 0.13, opaqueBase)} 100%)`;

    const getBackgroundColor = () => {
        if (selected) return selectedTintBackground;
        if (bgPolicy === 'white' && !hasExplicitDomainColor) return '#FFFFFF';
        if (bgPolicy === 'tint') return tintBackground;
        // 兜底：主题色微染白，而非 transparent（transparent 在画布网格上不可见）
        if (themeBackground && themeBackground !== 'transparent') return themeBackground;
        return isDarkTheme
            ? `color-mix(in srgb, ${themeMain} 8%, #1e2233 92%)`
            : `color-mix(in srgb, ${themeMain} 6%, #ffffff 94%)`;
    };

    const safeCustomStyle = { ...(d.customStyle || {}) } as React.CSSProperties;
    if ('backgroundColor' in safeCustomStyle) delete (safeCustomStyle as any).backgroundColor;
    if ('border' in safeCustomStyle) delete (safeCustomStyle as any).border;
    const getVisualBackgroundColor = () => {
        if (selected) return hexToRgba(themeMain, 0.06);
        if (bgPolicy === 'white' && !hasExplicitDomainColor) return '#FFFFFF';
        if (bgPolicy === 'tint') return '#FFFFFF'; // Treat tint as white for contrast purposes since it sits on a mostly light canvas
        return themeBackground || 'transparent'; // This is a simplification; transparent should probably assume the canvas color
    };

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
        
        if (bgColor) return resolveContrast(bgColor);
        return isDarkTheme ? '#FFFFFF' : '#1F2937';
    };

    // Helper for contrast when color is not provided
    const resolveContrast = (bg: string) => {
      return ensureReadableText('#1F2937', bg, 4.5, '#FFFFFF', '#1F2937');
    }

    // Determine the baseline color to test contrast against
    const contrastBaseBg = getVisualBackgroundColor();
    const effectiveContrastBg = contrastBaseBg === 'transparent' ? (isDarkTheme ? '#1e1e1e' : '#ffffff') : contrastBaseBg;

    const textColor = resolveContentTextColor(d?.customStyle?.color, effectiveContrastBg);

    // --- Computed Styles Objects ---
    const finalRadius = Math.min(radiusToken, 8); // 叶节点最多 8px，避免过于圆润
    const containerStyle: React.CSSProperties = {
        width: '100%', 
        height: '100%',
        maxWidth: nodeWidth ? `${nodeWidth}px` : undefined,
        /* 边框：选中时主题色实边，平时主题色 55% 透明度（从 30% 提高，在网格背景上清晰可见）*/
        border: selected
            ? `1.5px solid ${themeMain}`
            : `1px solid ${hexToRgba(themeBorder, 0.55)}`,
        borderRadius: `${finalRadius}px`,
        overflow: 'hidden',
        backgroundColor: getBackgroundColor(),
        /* 多层精细阴影 */
        boxShadow: selected
            ? `0 0 0 3px ${hexToRgba(themeMain, 0.18)}, 0 0 0 1px ${themeMain}, 0 6px 16px -3px rgba(0, 0, 0, 0.14)`
            : hovered
                ? `0 2px 8px -2px rgba(0,0,0,0.12), 0 8px 20px -5px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.22)`
                : `0 1px 3px rgba(0,0,0,0.06), 0 4px 10px -3px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.18)`,
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        /* 顶部多留 3px 给主题色带 */
        padding: `${finalPadV + 3}px ${finalPadH}px ${finalPadV}px`,
        boxSizing: 'border-box',
        transition: 'border-color 0.15s ease, box-shadow 0.2s ease, background-color 0.15s ease',
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

    // 智能图标推断：优先用户手动设置，其次 domainClass 映射，最后 label 关键词推断
    const resolvedIcon = useMemo(() => {
        // 用户已手动设置图标则不覆盖
        if (d?.icon) return null;
        // domainClass 直接命中
        const cls = String(d?.domainClass || '').toLowerCase();
        if (cls && DOMAIN_CLASS_ICON_MAP[cls]) return DOMAIN_CLASS_ICON_MAP[cls];
        // label 关键词推断（兜底）
        const label = String(d?.description || d?.label || '');
        return inferIconFromLabel(label);
    }, [d?.icon, d?.domainClass, d?.description, d?.label]);

    return {
        // Flags
        debugEnabled,
        // Computed values
        domainKey,
        themeMain,
        themeBorder,
        // Auto icon (null if user has set d.icon manually)
        resolvedIcon,
        // Styles
        containerStyle,
        contentStyle,
        textContainerStyle,
        getLineStyle,
        accentBarProps: getAccentBarProps(),
        statusStripeProps: getStatusStripeProps(),
    };
};
