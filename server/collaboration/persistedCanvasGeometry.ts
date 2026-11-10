const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const dimension = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000_000;

export const readPersistedCanvasZIndex = (saved: unknown): number | undefined => {
  if (!record(saved) || !record(saved.metadata)) return undefined;
  const metadata = saved.metadata;
  if (!record(metadata.canvasPosition) || !Number.isFinite(metadata.canvasPosition.x) || !Number.isFinite(metadata.canvasPosition.y)
    || !record(metadata.style)) return undefined;
  const value = metadata.style.zIndex;
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000 ? value : undefined;
};

/** Measured canvas sizes and rendering styles are distinct persisted values. */
export const restorePersistedCanvasGeometry = (element: Record<string, unknown>, savedInput: unknown,
  options: { restoreZIndex?: boolean } = {}): Record<string, unknown> => {
  if (!record(savedInput) || !record(savedInput.metadata)) return element;
  const metadata = savedInput.metadata;
  if (!record(metadata.canvasPosition) || !Number.isFinite(metadata.canvasPosition.x) || !Number.isFinite(metadata.canvasPosition.y)) return element;
  const savedStyle = record(metadata.style) ? metadata.style : {};
  const style = record(element.style) ? { ...element.style } : {};
  const restored = { ...element };
  let changed = false;
  // Container conversion supplies a default z-index. The saved rendering
  // order must win, otherwise a newly laid-out group conflicts with its own
  // cloud save (-10 in the live canvas, -1 after conversion).
  const zIndex = readPersistedCanvasZIndex(savedInput);
  if (options.restoreZIndex !== false && zIndex !== undefined) {
    restored.zIndex = zIndex;
    style.zIndex = zIndex;
    changed = true;
  }
  for (const name of ['width', 'height'] as const) {
    const measured = dimension(metadata[name]) ? metadata[name] : savedStyle[name];
    const rendered = dimension(savedStyle[name]) ? savedStyle[name] : metadata[name];
    if (!dimension(measured) || !dimension(rendered)) continue;
    restored[name] = measured; style[name] = rendered; changed = true;
  }
  return changed ? { ...restored, style } : element;
};
