import * as decoding from 'lib0/decoding';
import { COLLABORATION_FIELD_FORMAT } from '../../../../server/collaboration/documentModel';

export const COLLABORATION_ACCESS_MESSAGE = 4;
export type CollaborationAccess = 'editor' | 'viewer';
export const readCollaborationAccess = (decoder: decoding.Decoder): CollaborationAccess | null => {
  try {
    const role = decoding.readVarString(decoder);
    if (decoding.hasContent(decoder) || role.length > 32) return null;
    if (role === 'editor' || role === `editor:${COLLABORATION_FIELD_FORMAT}`) return 'editor';
    if (role === 'viewer' || role === `viewer:${COLLABORATION_FIELD_FORMAT}`) return 'viewer';
    return null;
  } catch { return null; }
};
