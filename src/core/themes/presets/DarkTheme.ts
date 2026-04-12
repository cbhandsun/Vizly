/**
 * 深色主题定义
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
 * buildDarkDomain
 * 基于品牌主色在深色主题下派生统一的域颜色集合：
 * - 背景：深色且带轻微主色倾向，减少眩光；
 * - 边框：略提亮以保持层次；
 * - 文本：统一近白，确保在暗背景下高对比；
 * - 阴影：主色更高透明度，突出卡片层级。
 */
function buildDarkDomain(base: string): ThemeColor {
  const rgb = parseColorToRgb(base);
  const lightRGB = adjustSaturationAndLightness(rgb, -0.22, -0.35);
  const bgRGB = adjustSaturationAndLightness(rgb, -0.25, -0.70);
  const darkRGB = adjustSaturationAndLightness(rgb, 0.10, -0.20);
  const borderRGB = adjustSaturationAndLightness(rgb, 0.08, 0.00);

  const lightHex = ThemeColorUtil.rgbToHex(lightRGB.r, lightRGB.g, lightRGB.b);
  const bgHex = ThemeColorUtil.rgbToHex(bgRGB.r, bgRGB.g, bgRGB.b);
  const darkHex = ThemeColorUtil.rgbToHex(darkRGB.r, darkRGB.g, darkRGB.b);
  const borderHex = ThemeColorUtil.rgbToHex(borderRGB.r, borderRGB.g, borderRGB.b);

  return {
    main: base,
    light: lightHex,
    dark: darkHex,
    contrast: '#ffffff',
    border: borderHex,
    background: bgHex,
    text: '#E6F1FF',
    shadow: toRgba(rgb, 0.30),
  };
}

export const darkThemePreset: ThemePreset = {
  id: 'dark',
  name: '深色主题',
  description: '现代的深色主题，适合夜间使用',
  category: 'built-in',
  tags: ['dark', 'modern', 'night'],
  theme: {
    id: 'dark',
    name: '深色主题',
    mode: 'dark',
    palette: {
      primary: {
        main: '#177ddc',
        light: '#69c0ff',
        dark: '#0050b3',
        contrast: '#ffffff',
        border: '#40a9ff',
        background: '#111b26',
        text: '#ffffff',
        shadow: 'rgba(23, 125, 220, 0.3)'
      },
      secondary: {
        main: '#722ed1',
        light: '#b37feb',
        dark: '#391085',
        contrast: '#ffffff',
        border: '#9254de',
        background: '#1a0d33',
        text: '#ffffff',
        shadow: 'rgba(114, 46, 209, 0.3)'
      },
      success: {
        main: '#49aa19',
        light: '#95de64',
        dark: '#237804',
        contrast: '#ffffff',
        border: '#73d13d',
        background: '#162312',
        text: '#ffffff',
        shadow: 'rgba(73, 170, 25, 0.3)'
      },
      warning: {
        main: '#d89614',
        light: '#ffd666',
        dark: '#ad6800',
        contrast: '#ffffff',
        border: '#ffc53d',
        background: '#2b2111',
        text: '#ffffff',
        shadow: 'rgba(216, 150, 20, 0.3)'
      },
      error: {
        main: '#dc4446',
        light: '#ff7875',
        dark: '#a8071a',
        contrast: '#ffffff',
        border: '#ff7875',
        background: '#2a1215',
        text: '#ffffff',
        shadow: 'rgba(220, 68, 70, 0.3)'
      },
      info: {
        main: '#177ddc',
        light: '#69c0ff',
        dark: '#0050b3',
        contrast: '#ffffff',
        border: '#40a9ff',
        background: '#111b26',
        text: '#ffffff',
        shadow: 'rgba(23, 125, 220, 0.3)'
      },
      neutral: {
        main: '#8c8c8c',
        light: '#595959',
        dark: '#d9d9d9',
        contrast: '#ffffff',
        border: '#434343',
        background: '#1f1f1f',
        // 函数级注释：提升中性文本的亮度以增强对比度
        // 原因：在深色背景(#1f1f1f)上，#ffffff 或 #f0f0f0 与背景形成更高对比度
        text: '#f0f0f0',
        shadow: 'rgba(255, 255, 255, 0.1)'
      }
    },
    typography: baseTypography,
    spacing: baseSpacing,
    borderRadius: baseBorderRadius,
    shadow: baseShadow,
    animation: baseAnimation,
    diagram: {
      domains: {
        // 统一通过派生函数生成深色主题的完整域颜色集合
        frontend: buildDarkDomain('#50E3C2'),
        backend: buildDarkDomain('#4A90E2'),
        middleware: buildDarkDomain('#F5A623'),
        database: buildDarkDomain('#9B59B6'),
        external: buildDarkDomain('#E74C3C'),
        'be-scm': buildDarkDomain('#0288D1'),
        mid: buildDarkDomain('#4CAF50'),
        data: buildDarkDomain('#FFC107'),
        ch: buildDarkDomain('#607D8B'),
        // 别名与主域保持一致
        fe: buildDarkDomain('#50E3C2'),
        'be-logistics': buildDarkDomain('#795548'),
        'be-corp': buildDarkDomain('#9C27B0'),
        infra: buildDarkDomain('#424242'),
      },
      edges: {
        default: {
          main: '#595959',
          light: '#262626',
          dark: '#8c8c8c',
          contrast: '#ffffff',
          border: '#434343',
          background: '#1f1f1f',
          // 函数级注释：提升边标签文本对比度，避免在深色画布上发灰
          text: '#eaeaea',
          shadow: 'rgba(255, 255, 255, 0.1)'
        },
        primary: {
          main: '#177ddc',
          light: '#111b26',
          dark: '#0050b3',
          contrast: '#ffffff',
          border: '#40a9ff',
          background: '#0d1a29',
          text: '#ffffff',
          shadow: 'rgba(23, 125, 220, 0.3)'
        },
        secondary: {
          main: '#722ed1',
          light: '#1a0d33',
          dark: '#391085',
          contrast: '#ffffff',
          border: '#9254de',
          background: '#120a25',
          text: '#ffffff',
          shadow: 'rgba(114, 46, 209, 0.3)'
        },
        dashed: {
          main: '#d89614',
          light: '#2b2111',
          dark: '#ad6800',
          contrast: '#ffffff',
          border: '#ffc53d',
          background: '#1f180a',
          text: '#ffffff',
          shadow: 'rgba(216, 150, 20, 0.3)'
        }
      },
      canvas: {
        background: '#141414',
        grid: {
          color: '#1f1f1f',
          size: 20,
          opacity: 0.3
        }
      },
      nodes: {
        default: {
          main: '#1f1f1f',
          light: '#262626',
          dark: '#141414',
          contrast: '#ffffff',
          border: '#434343',
          background: '#1f1f1f',
          // 函数级注释：节点文本使用更亮的近白色以提升可读性
          text: '#eaeaea',
          shadow: 'rgba(255, 255, 255, 0.1)'
        },
        selected: {
          main: '#177ddc',
          light: '#111b26',
          dark: '#0050b3',
          contrast: '#ffffff',
          border: '#177ddc',
          background: '#111b26',
          text: '#ffffff',
          shadow: 'rgba(23, 125, 220, 0.3)'
        },
        hover: {
          main: '#262626',
          light: '#2d2d2d',
          dark: '#1f1f1f',
          contrast: '#ffffff',
          border: '#40a9ff',
          background: '#262626',
          text: '#ffffff',
          shadow: 'rgba(255, 255, 255, 0.15)'
        }
      }
    }
  }
};
