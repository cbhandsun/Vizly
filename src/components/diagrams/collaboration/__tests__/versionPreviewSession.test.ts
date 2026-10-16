import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginVersionPreview, canPublishVersionSnapshot, discardVersionPreview, endVersionPreview,
  isVersionPreviewReadOnly, readVersionPreviewLive, retainVersionPreviewRemote, subscribeVersionPreview } from '../versionPreviewSession';
const id = 'preview-boundary-test';
const canvas = () => ({ nodes: [{ id: 'n', position: { x: 1, y: 2 }, data: { label: 'Original' } }], edges: [] });
afterEach(() => { discardVersionPreview(id); discardVersionPreview('other'); });
describe('version preview session boundary', () => {
  it('owns live values, blocks preview publication and unlocks only after the resumed canvas is committed', () => {
    const base = canvas();
    expect(beginVersionPreview(id, base)).toBe(true);
    base.nodes[0].data.label = 'Caller mutation';
    expect(readVersionPreviewLive(id)?.nodes[0].data.label).toBe('Original');
    expect(canPublishVersionSnapshot(id, base)).toBe(false);
    const live = endVersionPreview(id);
    expect(isVersionPreviewReadOnly(id)).toBe(true);
    expect(canPublishVersionSnapshot(id, base)).toBe(false);
    expect(canPublishVersionSnapshot(id, live)).toBe(false);
    expect(isVersionPreviewReadOnly(id)).toBe(false);
    expect(canPublishVersionSnapshot(id, base)).toBe(true);
  });
  it('preserves new peer values across preview switches and exit', () => {
    beginVersionPreview(id, canvas());
    const peer = canvas(); peer.nodes[0].data.label = 'Peer';
    expect(retainVersionPreviewRemote(id, peer)).toBe(true);
    peer.nodes[0].data.label = 'Mutation';
    beginVersionPreview(id, canvas());
    expect(endVersionPreview(id)?.nodes[0].data.label).toBe('Peer');
  });
  it('accepts an intentionally empty live canvas and keeps different diagrams independent', () => {
    expect(beginVersionPreview(id, { nodes: [], edges: [] })).toBe(true);
    expect(isVersionPreviewReadOnly('other')).toBe(false);
    expect(retainVersionPreviewRemote('other', canvas())).toBe(false);
    expect(endVersionPreview(id)).toEqual({ nodes: [], edges: [] });
    expect(canPublishVersionSnapshot(id, { nodes: [], edges: [] })).toBe(false);
    expect(isVersionPreviewReadOnly(id)).toBe(false);
  });
  it.each([null, {}, { nodes: 'bad', edges: [] }, { nodes: [{ id: 'n', position: { x: Infinity, y: 0 }, data: {} }], edges: [] },
    { nodes: Array.from({ length: 1001 }, (_, i) => ({ id: `n${i}`, position: { x: 0, y: 0 }, data: {} })), edges: [] },
    { nodes: [...canvas().nodes, ...canvas().nodes], edges: [] },
    { nodes: [{ id: 'n', position: { x: 0, y: 0 }, data: JSON.parse('{"__proto__":{"polluted":true}}') }], edges: [] },
  ])('rejects malformed, excessive or unsafe input without changing live state', value => {
    expect(beginVersionPreview(id, value)).toBe(false);
    expect(isVersionPreviewReadOnly(id)).toBe(false);
  });
  it('fails closed on invalid incoming content and never replaces the valid live snapshot', () => {
    beginVersionPreview(id, canvas());
    expect(() => retainVersionPreviewRemote(id, null)).toThrow('Invalid preview live snapshot');
    expect(readVersionPreviewLive(id)).toEqual(canvas());
    expect(beginVersionPreview('../bad', canvas())).toBe(false);
  });
  it('notifies read-only changes and clears an abandoned session with its last subscriber', () => {
    const listener = vi.fn(); const unsubscribe = subscribeVersionPreview(id, listener);
    beginVersionPreview(id, canvas());
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    expect(isVersionPreviewReadOnly(id)).toBe(false);
  });
});
