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

/**
 * Regeneration is deliberately separate from capture mode. Capture mode keeps
 * the production full-quality policy used by performance verification, while
 * regeneration also bypasses every external route candidate so generated
 * artifacts cannot validate and reproduce themselves.
 */
export const resolveBaseReactFlowPrecompiledRegenerationPresetId = ({
  search,
  hash,
}: {
  search: unknown;
  hash: unknown;
}): string | null => {
  const regenerationPresetId = readSingleParameter(search, 'precompiledRegenerate');
  if (!regenerationPresetId || typeof hash !== 'string') return null;
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return null;
  const activePresetId = readSingleParameter(hash.slice(queryIndex + 1), 'diagram');
  return activePresetId === regenerationPresetId ? regenerationPresetId : null;
};

export const resolveBaseReactFlowPrecompiledRegenerationPresetIdFromWindow = (): string | null => (
  typeof window === 'undefined'
    ? null
    : resolveBaseReactFlowPrecompiledRegenerationPresetId({
      search: window.location.search,
      hash: window.location.hash,
    })
);

export type BaseReactFlowPrecompiledCommittedRouteCapture = Readonly<{
  presetId: string;
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  sourceEdges: Edge[];
  displayPatches: Edge[];
}>;

type PrecompiledCaptureWindow = Window & {
  __vizlyPrecompiledCommittedRoute?: BaseReactFlowPrecompiledCommittedRouteCapture;
};

/**
 * Publishes the already signature-verified committed snapshot only for the
 * explicit localhost regeneration path. The bridge is intentionally separate
 * from phase trace/DOM diagnostics so route geometry is never logged or
 * serialized into ordinary diagnostics.
 */
export const publishBaseReactFlowPrecompiledCommittedRoute = (
  capture: BaseReactFlowPrecompiledCommittedRouteCapture,
): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return false;
  const activePresetId = resolveBaseReactFlowPrecompiledRegenerationPresetId({
    search: window.location.search,
    hash: window.location.hash,
  });
  if (activePresetId !== capture.presetId) return false;
  try {
    (window as PrecompiledCaptureWindow).__vizlyPrecompiledCommittedRoute = structuredClone(capture);
    return true;
  } catch {
    return false;
  }
};
import type { Edge } from '@xyflow/react';
