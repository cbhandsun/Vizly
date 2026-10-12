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
  for (const name of ['width', 'height'] as const) {
    const measured = dimension(metadata[name]) ? metadata[name] : savedStyle[name];
    const rendered = dimension(savedStyle[name]) ? savedStyle[name] : metadata[name];
    if (!dimension(measured) || !dimension(rendered)) continue;
    restored[name] = measured; style[name] = rendered; changed = true;
  }
  return changed ? { ...restored, style } : element;
};
