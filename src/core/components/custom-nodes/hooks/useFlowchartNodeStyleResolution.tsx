import React, { useMemo } from 'react';
import { useTheme } from '../../../themes/useCoreTheme';
import { getDomainTheme, resolveThemeDomainKey } from '../../../utils/domainKey';
import { pickReadableTextColor } from '../../../utils/colorUtils';
import { hexToRgba } from '../../shared/layoutUtils';
import { useDiagramStylePreset_v2 } from '../../../hooks/useDiagramStylePreset_v2';
import { useBusinessData } from '../../diagrams/useNodeUpdate';
import { Icon as IconifyIcon } from '@iconify/react';
import type { FlowchartNodeData } from '../../../types/flowchart-node';

export type { FlowchartNodeData, FlowchartShape } from '../../../types/flowchart-node';

import { FaPlay, FaSquare, FaCog, FaStop, FaDatabase, FaQuestion, FaArrowRight, FaLayerGroup, FaBox, FaThLarge, FaImage, FaEye, FaKeyboard, FaCircle, FaStar, FaFileAlt, FaCloud, FaClock, FaDesktop, FaStickyNote, FaHandPaper, FaDrawPolygon, FaServer, FaNetworkWired, FaLock, FaPlug, FaUser, FaEnvelope, FaBell, FaCode, FaTerminal } from 'react-icons/fa';

export const DOMAIN_CLASSES = [
    { key: 'ch', label: '渠道', color: '#2196F3' },
    { key: 'mid', label: '中台', color: '#FF9800' },
    { key: 'be-scm', label: '供应链', color: '#9C27B0' },
    { key: 'data', label: '数据', color: '#4CAF50' },
    { key: 'infra', label: '底座', color: '#455A64' },
    { key: 'external', label: '外部', color: '#9E9E9E' },
] as const;

export const ICON_MAP: Record<string, React.ReactNode> = {
    'play': <FaPlay size={14} />,
    'square': <FaSquare size={14} />,
    'cog': <FaCog size={14} />,
    'stop': <FaStop size={14} />,
    'database': <FaDatabase size={14} />,
    'question': <FaQuestion size={14} />,
    'arrow': <FaArrowRight size={14} />,
    'group': <FaLayerGroup size={14} />,
    'box': <FaBox size={14} />,
    'th-large': <FaThLarge size={14} />,
    'image': <FaImage size={14} />,
    'eye': <FaEye size={14} />,
    'keyboard': <FaKeyboard size={14} />,
    'circle': <FaCircle size={14} />,
    'star': <FaStar size={14} />,
    'file': <FaFileAlt size={14} />,
    'cloud': <FaCloud size={14} />,
    'clock': <FaClock size={14} />,
    'desktop': <FaDesktop size={14} />,
    'note': <FaStickyNote size={14} />,
    'hand': <FaHandPaper size={14} />,
    'hexagon': <FaDrawPolygon size={14} />,
    'server': <FaServer size={14} />,
    'network': <FaNetworkWired size={14} />,
    'lock': <FaLock size={14} />,
    'plug': <FaPlug size={14} />,
    'user': <FaUser size={14} />,
    'envelope': <FaEnvelope size={14} />,
    'bell': <FaBell size={14} />,
    'code': <FaCode size={14} />,
    'terminal': <FaTerminal size={14} />,
};

interface ResolutionParams {
    data: FlowchartNodeData;
    selected: boolean;
}

export function useFlowchartNodeStyleResolution({ data, selected }: ResolutionParams) {
    const [theme] = useTheme({ autoInitialize: true });
    const preset = useDiagramStylePreset_v2();
    const businessData = useBusinessData();

    return useMemo(() => {
        let resolvedIcon: React.ReactNode = typeof data.icon === 'string'
            ? (
                data.icon.includes(':')
                    ? <IconifyIcon icon={data.icon} width="1.1em" height="1.1em" style={{ verticalAlign: 'middle' }} />
                    : ICON_MAP[data.icon] || null
            )
            : data.icon;

        const domainKey = resolveThemeDomainKey(theme, {
            domainClass: data?.domainClass,
            domain: data?.domain,
        });
        const domainTheme = getDomainTheme(theme, { domainClass: data?.domainClass, domain: domainKey });

        let mainColor = domainTheme?.main || data.theme?.main || preset.edges.main.color || '#2196F3';
        
        const baseBorderColor = domainTheme?.border || data.theme?.border || mainColor;
        let finalBorderColor = preset.name === 'mono' ? '#111111' : baseBorderColor;

        const baseBgColor = domainTheme?.background || data.theme?.background || '#FFFFFF';

        let finalBgColor = baseBgColor;
        let backdropFilter = 'none';

        const hasExplicitDomainColor = !!(data?.domainClass && domainTheme?.background) || !!data?.theme?.background;

        if (preset.node.backgroundPolicy === 'white' && !hasExplicitDomainColor) {
            finalBgColor = '#FFFFFF';
        } else if (preset.node.backgroundPolicy === 'tint') {
            finalBgColor = hexToRgba(mainColor, 0.08);
        } else if (preset.name === 'glass') {
            finalBgColor = hexToRgba(mainColor, 0.15);
            backdropFilter = 'blur(10px) saturate(180%)';
        }

        let isHighlyTransparent = false;
        const rgbaMatch = finalBgColor.match(/rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([\d.]+))?\)/i);
        if (rgbaMatch && rgbaMatch[1]) {
           const alpha = parseFloat(rgbaMatch[1]);
           if (alpha < 0.4) {
               isHighlyTransparent = true;
           }
        }

        let textColor = domainTheme?.text;
        if (!textColor) {
            if (isHighlyTransparent) {
                // For highly transparent node backgrounds, rely on the app theme mode instead of the raw tint
                textColor = theme?.mode === 'dark' ? '#E5E7EB' : '#111111';
            } else {
                textColor = pickReadableTextColor(finalBgColor, '#FFFFFF', '#333333');
            }
        }

        const businessStateCandidate =
            data.businessKey && businessData ? businessData[data.businessKey] : null;
        const businessState =
            businessStateCandidate && typeof businessStateCandidate === 'object'
                ? {
                    ...businessStateCandidate,
                    status: 'status' in businessStateCandidate
                        && typeof businessStateCandidate.status === 'string'
                        ? businessStateCandidate.status
                        : undefined,
                }
                : null;

        if (businessState) {
            if (businessState.status === 'error') {
                mainColor = '#EF4444';
                finalBorderColor = '#EF4444';
                finalBgColor = '#FEE2E2';
                textColor = '#EF4444';
                resolvedIcon = <FaCog size={14} color="#EF4444" />;
            } else if (businessState.status === 'warning') {
                mainColor = '#F59E0B';
                finalBorderColor = '#F59E0B';
                finalBgColor = '#FEF3C7';
                textColor = '#F59E0B';
                resolvedIcon = <FaCog size={14} color="#F59E0B" />;
            } else if (businessState.status === 'success') {
                mainColor = '#10B981';
                finalBorderColor = '#10B981';
                finalBgColor = '#D1FAE5';
                textColor = '#10B981';
            }
        }

        const shape = data.shape || 'rectangle';
        const isStandardRect = shape === 'rectangle' || shape === 'predefined-process' || shape === 'internal-storage';
        const computedRadius = isStandardRect ? Math.min(preset.node.radius || 6, 6) : (preset.node.radius || 8);

        const nodeShadow = data.style?.shadow || preset.node.shadow || 'soft';
        const nodeOpacity = data.style?.opacity ?? 1;
        const borderStyleValue = data.style?.borderStyle || (preset.node.borderStyle === 'dashed' ? 'dashed' : 'solid');

        const strokeDashMap: Record<string, string> = {
            solid: 'none',
            dashed: '8,4',
            dotted: '2,4',
            double: 'none',
        };
        const resolvedStrokeDash = data.style?.strokeDasharray || strokeDashMap[borderStyleValue] || 'none';

        const shadowMap: Record<string, string> = {
            none: 'none',
            soft: `0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)`,
            medium: `0 4px 16px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)`,
            strong: `0 8px 32px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.10)`,
            glow: `0 0 20px ${hexToRgba(mainColor, 0.4)}, 0 0 40px ${hexToRgba(mainColor, 0.15)}`,
        };

        const nodeStyle = {
            '--node-main': mainColor,
            '--node-border': finalBorderColor,
            '--node-bg': finalBgColor,
            '--node-text': textColor,
            '--node-backdrop': backdropFilter,
            '--node-stroke-width': selected ? `${preset.node.borderWidth + 1}px` : `${preset.node.borderWidth}px`,
            '--node-stroke-dash': resolvedStrokeDash,
            '--node-radius': shape === 'pill' ? '50px' : `${computedRadius}px`,
            '--node-shadow-color': hexToRgba(mainColor, 0.2),
            '--node-shadow': shadowMap[nodeShadow] || 'none',
            opacity: nodeOpacity,
        } as React.CSSProperties;

        return {
            preset,
            shape,
            computedRadius,
            mainColor,
            finalBorderColor,
            finalBgColor,
            textColor,
            resolvedIcon,
            businessState,
            nodeStyle
        };
    }, [data, selected, theme, preset, businessData]);
}
