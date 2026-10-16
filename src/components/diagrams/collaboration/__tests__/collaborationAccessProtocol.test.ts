// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { readCollaborationAccess } from '../collaborationAccessProtocol';
import { formatCollaborationAccess } from '../../../../../server/collaboration/documentModel';

const claim = (value: string, trailing = false): decoding.Decoder => {
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, value);
  if (trailing) encoding.writeVarUint(encoder, 0);
  return decoding.createDecoder(encoding.toUint8Array(encoder));
};

describe('collaboration access protocol', () => {
  it.each(['editor', 'viewer'] as const)('accepts legacy and current %s claims', role => {
    expect(readCollaborationAccess(claim(role))).toBe(role);
    expect(readCollaborationAccess(claim(formatCollaborationAccess(role)))).toBe(role);
  });
  it.each(['', 'owner', 'Editor', 'editor:fields-v2', 'viewer:fields-v0', 'editor:fields-v1:extra', 'x'.repeat(33)])(
    'rejects unknown, empty and excessive claim %s', value => {
      expect(readCollaborationAccess(claim(value))).toBeNull();
    },
  );
  it('rejects trailing data and malformed or truncated encodings', () => {
    expect(readCollaborationAccess(claim('editor:fields-v1', true))).toBeNull();
    for (const bytes of [[], [255], [100, 65], [255, 255, 255, 255, 255, 255]]) {
      expect(readCollaborationAccess(decoding.createDecoder(Uint8Array.from(bytes)))).toBeNull();
    }
  });
});
