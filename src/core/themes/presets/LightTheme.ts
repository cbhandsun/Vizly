/**
 * 浅色主题定义
 */

import { ThemePreset, ThemeColor } from '../types/ThemeTypes';
import { ThemeColorUtil } from '../ThemeUtils';
import { parseColorToRgb, adjustSaturationAndLightness, toRgba } from '../../utils/colorUtils';
import { 
  baseTypography, 
  baseSpacing, 
  baseBorderRadius, 
  baseShadow, 
  baseAnimation 
} from '../constants/BaseConstants';

/**
 * buildLightDomain
 * 基于品牌主色在浅色主题下派生统一的域颜色集合：
 * - 背景：高亮浅色以增强呼吸感；
 * - 边框：略提亮/微饱和以保持边界清晰；
 * - 文本：根据背景自动选择对比色，保障可读性；
 * - 阴影：使用主色的低透明度，增强层次但不夺目。
 */
function buildLightDomain(base: string): ThemeColor {
  const rgb = parseColorToRgb(base);
  const lightRGB = adjustSaturationAndLightness(rgb, -0.28, 0.45);
  const bgRGB = adjustSaturationAndLightness(rgb, -0.34, 0.58);
  const darkRGB = adjustSaturationAndLightness(rgb, 0.05, -0.10);
  const borderRGB = adjustSaturationAndLightness(rgb, 0.08, -0.02);

  const lightHex = ThemeColorUtil.rgbToHex(lightRGB.r, lightRGB.g, lightRGB.b);
  const bgHex = ThemeColorUtil.rgbToHex(bgRGB.r, bgRGB.g, bgRGB.b);
  const darkHex = ThemeColorUtil.rgbToHex(darkRGB.r, darkRGB.g, darkRGB.b);
  const borderHex = ThemeColorUtil.rgbToHex(borderRGB.r, borderRGB.g, borderRGB.b);
  /**
   * 计算与背景的对比文本色（浅背景用深色，深背景用白色）
   * 使用相对亮度判断，避免浅色主题文本发灰或不可读。
   */
  function getContrastTextForBackgroundHex(hex: string): string {
    const bg = ThemeColorUtil.hexToRgb(hex);
    if (!bg) return '#001529';
    const luminance = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255;
    // 亮度 > 0.55 时返回更柔和的深灰，否则保持白色
    return luminance > 0.55 ? '#2A3B4C' : '#ffffff';
  }
  const textHex = getContrastTextForBackgroundHex(bgHex);

  return {
    main: base,
    light: lightHex,
    dark: darkHex,
    contrast: '#ffffff',
    border: borderHex,
    background: bgHex,
    text: textHex,
    shadow: toRgba(rgb, 0.18),
  };
}

export const lightThemePreset: ThemePreset = {
  id: 'light',
  name: '浅色主题',
  description: '经典的浅色主题，适合日间使用',
  category: 'built-in',
  tags: ['light', 'classic', 'professional'],
  theme: {
    id: 'light',
    name: '浅色主题',
    mode: 'light',
    palette: {
      primary: {
        main: '#007bff',
        light: '#69c0ff',
        dark: '#0050b3',
        contrast: '#ffffff',
        border: '#40a9ff',
        background: '#e6f7ff',
        text: '#001529',
        shadow: 'rgba(24, 144, 255, 0.2)'
      },
      secondary: {
        main: '#722ed1',
        light: '#b37feb',
        dark: '#391085',
        contrast: '#ffffff',
        border: '#9254de',
        background: '#f9f0ff',
        text: '#22075e',
        shadow: 'rgba(114, 46, 209, 0.2)'
      },
      success: {
        main: '#52c41a',
        light: '#95de64',
        dark: '#237804',
        contrast: '#ffffff',
        border: '#73d13d',
        background: '#f6ffed',
        text: '#092b00',
        shadow: 'rgba(82, 196, 26, 0.2)'
      },
      warning: {
        main: '#faad14',
        light: '#ffd666',
        dark: '#ad6800',
        contrast: '#ffffff',
        border: '#ffc53d',
        background: '#fffbe6',
        text: '#613400',
        shadow: 'rgba(250, 173, 20, 0.2)'
      },
      error: {
        main: '#ff4d4f',
        light: '#ff7875',
        dark: '#a8071a',
        contrast: '#ffffff',
        border: '#ff7875',
        background: '#fff2f0',
        text: '#5c0011',
        shadow: 'rgba(255, 77, 79, 0.2)'
      },
      info: {
        main: '#1890ff',
        light: '#69c0ff',
        dark: '#0050b3',
        contrast: '#ffffff',
        border: '#40a9ff',
        background: '#e6f7ff',
        text: '#001529',
        shadow: 'rgba(24, 144, 255, 0.2)'
      },
      neutral: {
        main: '#8c8c8c',
        light: '#d9d9d9',
        dark: '#262626',
        contrast: '#ffffff',
        border: '#d9d9d9',
        background: '#fafafa',
        text: '#000000',
        shadow: 'rgba(0, 0, 0, 0.1)'
      }
    },
    typography: baseTypography,
    spacing: baseSpacing,
    borderRadius: baseBorderRadius,
    shadow: baseShadow,
    animation: baseAnimation,
    diagram: {
      domains: {
        // 统一通过派生函数生成浅色主题的完整域颜色集合
        frontend: buildLightDomain('#66BB6A'),
        backend: buildLightDomain('#76B7FF'),
        middleware: buildLightDomain('#FFCA80'),
        database: buildLightDomain('#A56DDD'),
        external: buildLightDomain('#FF8575'),
        'be-scm': buildLightDomain('#43B9F0'),
        mid: buildLightDomain('#5CC157'),
        data: buildLightDomain('#FFC440'),
        ch: buildLightDomain('#93A9BD'),
        // 别名与主域保持一致
        fe: buildLightDomain('#66BB6A'),
        'be-logistics': buildLightDomain('#A1887F'),
        'be-corp': buildLightDomain('#BB6BD9'),
        infra: buildLightDomain('#9E9E9E'),
      },
      edges: {
        default: {
          main: '#8c8c8c',
          light: '#d9d9d9',
          dark: '#595959',
          contrast: '#ffffff',
          border: '#bfbfbf',
          background: '#f5f5f5',
          text: '#262626',
          shadow: 'rgba(140, 140, 140, 0.2)'
        },
        primary: {
          main: '#1890ff',
          light: '#69c0ff',
          dark: '#0050b3',
          contrast: '#ffffff',
          border: '#40a9ff',
          background: '#e6f7ff',
          text: '#001529',
          shadow: 'rgba(24, 144, 255, 0.2)'
        },
        secondary: {
          main: '#722ed1',
          light: '#b37feb',
          dark: '#391085',
          contrast: '#ffffff',
          border: '#9254de',
          background: '#f9f0ff',
          text: '#22075e',
          shadow: 'rgba(114, 46, 209, 0.2)'
        },
        dashed: {
          main: '#faad14',
          light: '#ffd666',
          dark: '#ad6800',
          contrast: '#ffffff',
          border: '#ffc53d',
          background: '#fffbe6',
          text: '#613400',
          shadow: 'rgba(250, 173, 20, 0.2)'
        }
      },
      canvas: {
        background: '#ffffff',
        grid: {
          color: '#f0f0f0',
          size: 20,
          opacity: 0.5
        }
      },
      nodes: {
        default: {
          main: '#ffffff',
          light: '#fafafa',
          dark: '#f5f5f5',
          contrast: '#000000',
          border: '#d9d9d9',
          background: '#ffffff',
          text: '#262626',
          shadow: 'rgba(0, 0, 0, 0.1)'
        },
        selected: {
          main: '#1890ff',
          light: '#e6f7ff',
          dark: '#0050b3',
          contrast: '#ffffff',
          border: '#1890ff',
          background: '#e6f7ff',
          text: '#001529',
          shadow: 'rgba(24, 144, 255, 0.3)'
        },
        hover: {
          main: '#f0f0f0',
          light: '#fafafa',
          dark: '#d9d9d9',
          contrast: '#000000',
          border: '#40a9ff',
          background: '#f0f0f0',
          text: '#262626',
          shadow: 'rgba(0, 0, 0, 0.15)'
        }
      }
    }
  }
};
