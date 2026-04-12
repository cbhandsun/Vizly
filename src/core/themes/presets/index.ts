/**
 * 主题预设导出文件
 * 统一导出所有主题预设
 */

// 导入所有主题预设
import { highContrastThemePreset } from './HighContrastTheme';
import { sunsetThemePreset } from './SunsetTheme';
import { monoThemePreset } from './MonoTheme';
import { originalThemePreset } from './OriginalTheme';
import { darkThemePreset } from './DarkTheme';
import { lightThemePreset } from './LightTheme';
import { forestThemePreset } from './ForestTheme';
import { oceanThemePreset } from './OceanTheme';
import { blueprintThemePreset } from './BlueprintTheme';
import { sketchThemePreset } from './SketchTheme';
import { corporateThemePreset } from './CorporateTheme';

// 重新导出所有主题预设
export { highContrastThemePreset } from './HighContrastTheme';
export { sunsetThemePreset } from './SunsetTheme';
export { monoThemePreset } from './MonoTheme';
export { originalThemePreset } from './OriginalTheme';
export { darkThemePreset } from './DarkTheme';
export { lightThemePreset } from './LightTheme';
export { forestThemePreset } from './ForestTheme';
export { oceanThemePreset } from './OceanTheme';
export { blueprintThemePreset } from './BlueprintTheme';
export { sketchThemePreset } from './SketchTheme';
export { corporateThemePreset } from './CorporateTheme';

// 主题预设数组
export const themePresets = [
  highContrastThemePreset,
  sunsetThemePreset,
  monoThemePreset,
  originalThemePreset,
  darkThemePreset,
  lightThemePreset,
  forestThemePreset,
  oceanThemePreset,
  blueprintThemePreset,
  sketchThemePreset,
  corporateThemePreset,
];

// 主题预设映射
export const themePresetMap = {
  'high-contrast': highContrastThemePreset,
  'sunset': sunsetThemePreset,
  'mono': monoThemePreset,
  'original': originalThemePreset,
  'dark': darkThemePreset,
  'light': lightThemePreset,
  'forest': forestThemePreset,
  'ocean': oceanThemePreset,
  'blueprint': blueprintThemePreset,
  'sketch': sketchThemePreset,
  'corporate': corporateThemePreset,
};
