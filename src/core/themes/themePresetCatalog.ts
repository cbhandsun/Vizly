import type {
  ThemeAnimation,
  ThemeBorderRadius,
  ThemeColor,
  ThemePalette,
  ThemeShadow,
  ThemeSpacing,
  ThemeTypography,
} from './types/ThemeTypes';

export interface PresetCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  order: number;
}

export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  baseTheme: string;
  customizations: {
    palette?: Partial<ThemePalette>;
    diagram?: {
      domains?: Record<string, ThemeColor>;
      edges?: Partial<Record<'default' | 'primary' | 'secondary' | 'dashed', ThemeColor>>;
      canvas?: Partial<{
        background: string;
        grid: { color: string; size: number; opacity: number };
      }>;
      nodes?: Partial<Record<'default' | 'selected' | 'hover', ThemeColor>>;
    };
    typography?: Partial<ThemeTypography>;
    spacing?: Partial<ThemeSpacing>;
    borderRadius?: Partial<ThemeBorderRadius>;
    shadow?: Partial<ThemeShadow>;
    animation?: Partial<ThemeAnimation>;
  };
  preview?: string;
}

export const DEFAULT_THEME_PRESET_CATEGORIES: PresetCategory[] = [
  { id: 'built-in', name: '内置主题', description: '系统内置的主题预设', icon: '🏠', order: 1 },
  { id: 'preset', name: '系统预设', description: '系统提供的主题预设', icon: '💼', order: 2 },
  { id: 'community', name: '社区主题', description: '来自社区贡献的主题', icon: '🎨', order: 3 },
  { id: 'custom', name: '自定义主题', description: '用户创建的自定义主题', icon: '♿', order: 4 },
];

export const THEME_PRESET_TEMPLATES: ThemeTemplate[] = [
  {
    id: 'ocean-blue',
    name: '海洋蓝',
    description: '清新的海洋蓝色主题，适合技术文档',
    baseTheme: 'light',
    customizations: {
      palette: {
        primary: {
          main: '#0077be', light: '#e6f3ff', dark: '#005a8b', contrast: '#ffffff',
          border: '#0088cc', background: '#f0f8ff', text: '#003d5c', shadow: 'rgba(0, 119, 190, 0.2)',
        },
      },
      diagram: {
        domains: {
          frontend: {
            main: '#00bcd4', light: '#e0f7fa', dark: '#0097a7', contrast: '#ffffff',
            border: '#26c6da', background: '#e0f2f1', text: '#004d40', shadow: 'rgba(0, 188, 212, 0.2)',
          },
          backend: {
            main: '#2196f3', light: '#e3f2fd', dark: '#1976d2', contrast: '#ffffff',
            border: '#42a5f5', background: '#e8f4fd', text: '#0d47a1', shadow: 'rgba(33, 150, 243, 0.2)',
          },
        },
      },
    },
  },
  {
    id: 'forest-green',
    name: '森林绿',
    description: '自然的森林绿色主题，环保友好',
    baseTheme: 'light',
    customizations: {
      palette: {
        primary: {
          main: '#4caf50', light: '#e8f5e8', dark: '#388e3c', contrast: '#ffffff',
          border: '#66bb6a', background: '#f1f8e9', text: '#1b5e20', shadow: 'rgba(76, 175, 80, 0.2)',
        },
      },
      diagram: {
        domains: {
          frontend: {
            main: '#8bc34a', light: '#f1f8e9', dark: '#689f38', contrast: '#ffffff',
            border: '#9ccc65', background: '#f9fbe7', text: '#33691e', shadow: 'rgba(139, 195, 74, 0.2)',
          },
          backend: {
            main: '#4caf50', light: '#e8f5e8', dark: '#388e3c', contrast: '#ffffff',
            border: '#66bb6a', background: '#e8f5e8', text: '#1b5e20', shadow: 'rgba(76, 175, 80, 0.2)',
          },
        },
      },
    },
  },
  {
    id: 'sunset-orange',
    name: '日落橙',
    description: '温暖的日落橙色主题，充满活力',
    baseTheme: 'light',
    customizations: {
      palette: {
        primary: {
          main: '#ff9800', light: '#fff3e0', dark: '#f57c00', contrast: '#ffffff',
          border: '#ffb74d', background: '#fff8e1', text: '#e65100', shadow: 'rgba(255, 152, 0, 0.2)',
        },
      },
      diagram: {
        domains: {
          frontend: {
            main: '#ff5722', light: '#fbe9e7', dark: '#d84315', contrast: '#ffffff',
            border: '#ff7043', background: '#fff3e0', text: '#bf360c', shadow: 'rgba(255, 87, 34, 0.2)',
          },
          backend: {
            main: '#ff9800', light: '#fff3e0', dark: '#f57c00', contrast: '#ffffff',
            border: '#ffb74d', background: '#fff8e1', text: '#e65100', shadow: 'rgba(255, 152, 0, 0.2)',
          },
        },
      },
    },
  },
  {
    id: 'purple-galaxy',
    name: '紫色星系',
    description: '神秘的紫色星系主题，科技感十足',
    baseTheme: 'dark',
    customizations: {
      palette: {
        primary: {
          main: '#9c27b0', light: '#f3e5f5', dark: '#7b1fa2', contrast: '#ffffff',
          border: '#ba68c8', background: '#1a0d1f', text: '#ffffff', shadow: 'rgba(156, 39, 176, 0.3)',
        },
      },
      diagram: {
        domains: {
          frontend: {
            main: '#e91e63', light: '#fce4ec', dark: '#c2185b', contrast: '#ffffff',
            border: '#f06292', background: '#1f0a14', text: '#ffffff', shadow: 'rgba(233, 30, 99, 0.3)',
          },
          backend: {
            main: '#673ab7', light: '#ede7f6', dark: '#512da8', contrast: '#ffffff',
            border: '#9575cd', background: '#1a0d2e', text: '#ffffff', shadow: 'rgba(103, 58, 183, 0.3)',
          },
        },
      },
    },
  },
];
