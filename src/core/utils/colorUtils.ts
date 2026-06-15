// src/utils/colorUtils.ts

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}

export function parseColorToRgb(color: string): RGB {
  if (!color) return { r: 144, g: 164, b: 174 };
  const c = color.trim();
  // #RGB or #RRGGBB
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map(x => x + x).join('') : hex;
    const num = parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  // rgb() or rgba()
  const m = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
  }
  // fallback neutral
  return { r: 144, g: 164, b: 174 };
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
  let h = 0; const l = (max + min) / 2; const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rp, gp, bp] = (() => {
    if (0 <= h && h < 60) return [c, x, 0];
    if (60 <= h && h < 120) return [x, c, 0];
    if (120 <= h && h < 180) return [0, c, x];
    if (180 <= h && h < 240) return [0, x, c];
    if (240 <= h && h < 300) return [x, 0, c];
    return [c, 0, x];
  })();
  return { r: Math.round((rp + m) * 255), g: Math.round((gp + m) * 255), b: Math.round((bp + m) * 255) };
}

export function adjustSaturationAndLightness(rgb: RGB, saturateDelta = 0.3, lightnessDelta = -0.07): RGB {
  const hsl = rgbToHsl(rgb);
  const s = clamp(hsl.s + saturateDelta, 0, 1);
  const l = clamp(hsl.l + lightnessDelta, 0, 1);
  return hslToRgb({ h: hsl.h, s, l });
}

export function toRgba({ r, g, b }: RGB, alpha = 1): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function makeSoftTintGradient(baseColor: string, opts?: { topAlpha?: number; bottomAlpha?: number; saturateDelta?: number; lightnessDelta?: number }): string {
  const { topAlpha = 0.22, bottomAlpha = 0.08, saturateDelta = 0.28, lightnessDelta = -0.06 } = opts || {};
  const rgb = parseColorToRgb(baseColor);
  const adj = adjustSaturationAndLightness(rgb, saturateDelta, lightnessDelta);
  const top = toRgba(adj, topAlpha);
  const bottom = toRgba(adj, bottomAlpha);
  return `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
}

/**
 * 计算相对亮度（WCAG）
 * 输入：任意颜色字符串（#RGB/#RRGGBB/rgb/rgba）
 * 输出：0..1 的亮度值
 */
export function getRelativeLuminance(color: string): number {
  const { r, g, b } = parseColorToRgb(color);
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/**
 * 判断颜色是否偏亮
 * 阈值默认 0.5，可按需调整
 */
export function isLightColor(color?: string, threshold = 0.5): boolean {
  if (!color) return true;
  const rgb = parseColorToRgb(color);
  return rgbToHsl(rgb).l >= threshold;
}

/**
 * 根据背景选择可读文本色
 * 背景偏亮 → 返回 darkColor；背景偏暗 → 返回 lightColor
 */
export function pickReadableTextColor(bgColor: string, lightColor = '#FFFFFF', darkColor = '#111111'): string {
  return isLightColor(bgColor) ? darkColor : lightColor;
}

/**
 * 计算前景与背景的对比度（WCAG 2.1）
 * 返回值：对比度比值（例如 4.5 表示达标的普通文本对比）
 */
export function getContrastRatio(fgColor: string, bgColor: string): number {
  const L1 = getRelativeLuminance(fgColor);
  const L2 = getRelativeLuminance(bgColor);
  const [maxL, minL] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (maxL + 0.05) / (minL + 0.05);
}

/**
 * 若对比度不足则替换为可读文本色
 */
export function ensureReadableText(fgColor: string | undefined, bgColor: string, minRatio = 4.5, lightColor = '#FFFFFF', darkColor = '#111111'): string {
  const candidate = (fgColor && fgColor.trim().length > 0) ? fgColor : pickReadableTextColor(bgColor, lightColor, darkColor);
  const ratio = getContrastRatio(candidate, bgColor);
  if (!isFinite(ratio) || ratio < minRatio) {
    return pickReadableTextColor(bgColor, lightColor, darkColor);
  }
  return candidate;
}
