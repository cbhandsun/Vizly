import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WheelEvent as ReactWheelEvent } from 'react';
import { logPanelZoomStorageReadFailure, logPanelZoomStorageWriteFailure } from './panelZoomLogging';

interface PanelZoomOptions {
  storageKey: string;
  defaultScale?: number;
  minScale?: number;
  maxScale?: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const usePanelZoom = ({
  storageKey,
  defaultScale = 1,
  minScale = 0.7,
  maxScale = 1.4,
}: PanelZoomOptions) => {
  const [scale, setScale] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? Number(raw) : defaultScale;
      return clamp(Number.isFinite(parsed) ? parsed : defaultScale, minScale, maxScale);
    } catch (error) {
      logPanelZoomStorageReadFailure(storageKey, error);
      return defaultScale;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(scale));
    } catch (error) {
      logPanelZoomStorageWriteFailure(storageKey, error);
    }
  }, [scale, storageKey]);

  const setScaleClamped = useCallback(
    (next: number | ((prev: number) => number)) => {
      setScale((prev) => {
        const v = typeof next === 'function' ? next(prev) : next;
        return clamp(v, minScale, maxScale);
      });
    },
    [minScale, maxScale]
  );

  const percent = useMemo(() => Math.round(scale * 100), [scale]);

  const setPercent = useCallback(
    (p: number) => {
      const v = clamp(p, Math.round(minScale * 100), Math.round(maxScale * 100)) / 100;
      setScaleClamped(v);
    },
    [minScale, maxScale, setScaleClamped]
  );

  const reset = useCallback(() => setScaleClamped(defaultScale), [defaultScale, setScaleClamped]);

  const zoomIn = useCallback(() => {
    setScaleClamped((s) => clamp(s + 0.06, minScale, maxScale));
  }, [maxScale, minScale, setScaleClamped]);

  const zoomOut = useCallback(() => {
    setScaleClamped((s) => clamp(s - 0.06, minScale, maxScale));
  }, [maxScale, minScale, setScaleClamped]);

  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const sensitivity = e.shiftKey ? 0.012 : 0.007;
      const normalized = clamp(e.deltaY, -120, 120);
      const factor = Math.exp(-normalized * sensitivity);
      setScaleClamped((s) => clamp(s * factor, minScale, maxScale));
    },
    [maxScale, minScale, setScaleClamped]
  );

  return {
    scale,
    percent,
    setPercent,
    setScale: setScaleClamped,
    reset,
    zoomIn,
    zoomOut,
    onWheel,
    minScale,
    maxScale,
  };
};

export type PanelZoomApi = ReturnType<typeof usePanelZoom>;
