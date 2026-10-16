import * as decoding from 'lib0/decoding';
export const COORDINATION_STATUS_MESSAGE = 5;
export type CoordinationProblem = 'cloud-conflict' | 'cloud-unavailable';
export const readCoordinationProblem = (decoder: decoding.Decoder): CoordinationProblem | null => {
  try {
    const value = decoding.readVarString(decoder);
    return !decoding.hasContent(decoder) && (value === 'cloud-conflict' || value === 'cloud-unavailable') ? value : null;
  } catch { return null; }
};
