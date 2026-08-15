const MAX_LOCATION_PART_LENGTH = 2_048;
const MAX_PRESET_ID_LENGTH = 120;
const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type LocationInput = Readonly<{
  search?: unknown;
  hash?: unknown;
}>;

const readSingleParameter = (raw: unknown, name: string): string | null => {
  if (
    typeof raw !== 'string'
    || raw.length === 0
    || raw.length > MAX_LOCATION_PART_LENGTH
  ) return null;
  try {
    const values = new URLSearchParams(raw).getAll(name);
    if (values.length !== 1) return null;
    const value = values[0];
    return value.length > 0
      && value.length <= MAX_PRESET_ID_LENGTH
      && PRESET_ID_PATTERN.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
};
const readHashQuery = (hash: unknown): string | null => {
  if (typeof hash !== 'string' || hash.length > MAX_LOCATION_PART_LENGTH) return null;
  const queryIndex = hash.indexOf('?');
  return queryIndex >= 0 ? hash.slice(queryIndex + 1) : null;
};

/**
 * Verification and route generation need the canonical preset, not a user's
 * editable autosave. The mode is accepted only when a bounded control value
 * and the active route name the same valid preset.
 */
export const resolveCanonicalStandardPresetId = (
  location: LocationInput | null | undefined,
): string | null => {
  if (!location) return null;
  const routeId = readSingleParameter(readHashQuery(location.hash), 'diagram')
    ?? readSingleParameter(location.search, 'diagram');
  if (!routeId) return null;
  const requestedIds = [
    readSingleParameter(location.search, 'canonicalPreset'),
    readSingleParameter(location.search, 'precompiledCapture'),
    readSingleParameter(location.search, 'precompiledRegenerate'),
  ];
  return requestedIds.includes(routeId) ? routeId : null;
};
