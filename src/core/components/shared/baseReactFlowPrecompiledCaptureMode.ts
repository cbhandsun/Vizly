const MAX_LOCATION_PART_LENGTH = 2_048;
const MAX_PRESET_ID_LENGTH = 120;
const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const readSingleParameter = (
  raw: unknown,
  name: string,
): string | null => {
  if (
    typeof raw !== 'string'
    || raw.length === 0
    || raw.length > MAX_LOCATION_PART_LENGTH
  ) return null;
  try {
    const values = new URLSearchParams(raw).getAll(name);
    if (values.length !== 1) return null;
    const value = values[0];
    return (
      value.length > 0
      && value.length <= MAX_PRESET_ID_LENGTH
      && PRESET_ID_PATTERN.test(value)
    )
      ? value
      : null;
  } catch {
    return null;
  }
};

/**
 * Returns the capture preset only when the bounded query and active hash route
 * name the same valid preset. Ordinary user URLs therefore retain the normal
 * large-graph interactive policy.
 */
export const resolveBaseReactFlowPrecompiledCapturePresetId = ({
  search,
  hash,
}: {
  search: unknown;
  hash: unknown;
}): string | null => {
  const capturePresetId = readSingleParameter(search, 'precompiledCapture');
  if (!capturePresetId || typeof hash !== 'string') return null;
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return null;
  const activePresetId = readSingleParameter(hash.slice(queryIndex + 1), 'diagram');
  return activePresetId === capturePresetId ? capturePresetId : null;
};
