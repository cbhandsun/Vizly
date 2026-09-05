import { useCallback, useState } from 'react';

export type EdgeLabelSize = { width: number; height: number };
export const EDGE_LABEL_MAX_WIDTH = 220;

export const readEdgeLabelSize = (value: unknown): EdgeLabelSize | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  if (!('width' in value) || !('height' in value)) return undefined;
  const { width, height } = value;
  if (typeof width !== 'number' || typeof height !== 'number'
    || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 0 || height <= 0 || width > 100_000 || height > 100_000) return undefined;
  return { width: Math.ceil(width), height: Math.ceil(height) };
};

// This is only the pre-mount fallback. Font metrics, wrapping and custom label
// styles are resolved by the DOM measurement, never certified by this estimate.
export const estimateEdgeLabelSize = (text: string): EdgeLabelSize => {
  const lines = text.split(/\r\n|\r|\n/);
  let rows = 0;
  let width = 42;
  for (const line of lines) {
    let textWidth = 0;
    for (const glyph of line) textWidth += glyph.charCodeAt(0) < 128 ? 8 : 22;
    width = Math.max(width, Math.min(EDGE_LABEL_MAX_WIDTH, textWidth + 22));
    rows += Math.max(1, Math.ceil(textWidth / (EDGE_LABEL_MAX_WIDTH - 22)));
  }
  return { width, height: 26 + (rows - 1) * 22 };
};

export const useEdgeLabelMeasurement = (label: unknown, appearance: unknown) => {
  const [measurement, setMeasurement] = useState<{
    label: unknown; appearance: unknown; size: EdgeLabelSize;
  }>();
  const labelRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      // offsetWidth/Height are unscaled border-box dimensions. Client rects
      // include both the canvas zoom and the readability transform.
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      // DOM offsets round fractional CSS pixels; reserve one pixel so the
      // collision rectangle never rounds inward. Hidden elements stay invalid.
      const size = readEdgeLabelSize({ width: width > 0 ? width + 1 : 0, height: height > 0 ? height + 1 : 0 });
      if (!size) return;
      setMeasurement(previous => previous && previous.label === label && previous.appearance === appearance
        && previous.size.width === size.width && previous.size.height === size.height
        ? previous : { label, appearance, size });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element, { box: 'border-box' });
    return () => { active = false; observer?.disconnect(); };
  }, [label, appearance]);
  return {
    labelRef,
    labelSize: measurement && measurement.label === label && measurement.appearance === appearance
      ? measurement.size : undefined,
  };
};
