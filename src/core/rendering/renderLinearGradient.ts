import { normalizeSvgPaint } from './styleTokens';
import type { RenderLinearGradient } from './types';

const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  return [...parts, value.slice(start).trim()].filter(Boolean);
};

const normalizeColor = (value: string): string => {
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/iu.exec(value);
  if (!srgb) return normalizeSvgPaint(value, '');
  const channels = srgb.slice(1, 4).map(Number);
  return channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1)
    ? `rgb(${channels.map(channel => Math.round(channel * 255)).join(', ')})`
    : '';
};

const normalizeThreeColors = (value: unknown): RenderLinearGradient | undefined => {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const colors = value.map(color => normalizeSvgPaint(color, ''));
  return colors.every(Boolean) ? colors as RenderLinearGradient : undefined;
};

export const parseRenderedLinearGradient = (value: unknown): RenderLinearGradient | undefined => {
  if (typeof value !== 'string' || !value || value.length > 4_096) return undefined;
  const start = value.toLowerCase().lastIndexOf('linear-gradient(');
  if (start < 0 || (start > 0 && /[-\w]/u.test(value[start - 1])) || !value.endsWith(')')) return undefined;
  const parts = splitTopLevel(value.slice(start + 'linear-gradient('.length, -1));
  if (parts.length !== 3) return undefined;
  const expectedOffsets = [0, 60, 100];
  const colors = parts.map((part, index) => {
    const match = /^(.*)\s+(\d{1,3})%$/u.exec(part);
    return match && Number(match[2]) === expectedOffsets[index] ? normalizeColor(match[1].trim()) : '';
  });
  return colors.every(Boolean) ? colors as RenderLinearGradient : undefined;
};

export const normalizeRenderLinearGradient = normalizeThreeColors;
