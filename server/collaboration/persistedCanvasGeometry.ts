const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const dimension = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000_000;

/** Measured canvas sizes and rendering styles are distinct persisted values. */
export const restorePersistedCanvasGeometry = (element: Record<string, unknown>, savedInput: unknown): Record<string, unknown> => {
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
  if (typeof savedStyle.zIndex === 'number' && Number.isSafeInteger(savedStyle.zIndex)
    && Math.abs(savedStyle.zIndex) <= 1_000_000) {
    restored.zIndex = savedStyle.zIndex;
    style.zIndex = savedStyle.zIndex;
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
