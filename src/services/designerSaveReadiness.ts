/** Legacy/static documents have no readiness method; live designers must report success. */
export const isDesignerSaveReady = (bridge: unknown): boolean => {
  if (bridge === null || typeof bridge !== 'object' || Array.isArray(bridge)) return false;
  try {
    const readiness = Reflect.get(bridge, 'isCanvasReady');
    if (readiness === undefined) return true;
    if (typeof readiness !== 'function') return false;
    return Reflect.apply(readiness, bridge, []) === true;
  } catch { return false; }
};

export const assertDesignerSaveReady = (bridge: unknown): void => {
  if (!isDesignerSaveReady(bridge)) throw new Error('图表尚未加载完成，请等待或重试后保存');
};
