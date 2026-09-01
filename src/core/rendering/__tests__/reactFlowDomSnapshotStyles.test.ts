// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';

import { enrichSnapshotWithRenderedNodeStyles } from '../reactFlowDomSnapshotStyles';

describe('enrichSnapshotWithRenderedNodeStyles', () => {
  it('captures bounded rendered custom-node styles without mutating the source snapshot', () => {
    document.body.innerHTML = `
      <div id="diagram-test">
        <div data-vizly-export-node-id="node-1" style="background-color: rgb(247, 244, 243); border: 1px solid rgba(166, 126, 112, 0.55); border-radius: 8px; padding: 26px 16px 23px">
          <div data-vizly-export-node-accent="true" style="position:absolute;left:0;right:0;top:0;height:3px;background-color:rgba(161,136,127,.85)"></div>
          <div data-vizly-export-node-content="true" style="color:rgb(42,59,76);font:400 16px/1.4 Arial;text-align:left"></div>
        </div>
      </div>`;
    const node = { id: 'node-1', position: { x: 0, y: 0 }, data: { description: 'Original' } } as Node;
    const snapshot = { nodes: [node], edges: [] };

    const result = enrichSnapshotWithRenderedNodeStyles(snapshot, document.getElementById('diagram-test') ?? document);

    expect(result).not.toBe(snapshot);
    expect(result.nodes[0]).not.toBe(node);
    expect(result.nodes[0].data).toMatchObject({
      description: 'Original',
      __vizlyExportStyle: {
        fill: 'rgb(247, 244, 243)',
        stroke: 'rgba(166, 126, 112, 0.55)',
        strokeWidth: 1,
        borderRadius: 8,
        textColor: 'rgb(42, 59, 76)',
        fontSize: 16,
        textAlign: 'left',
        paddingLeft: 16,
        paddingTop: 26,
        accent: { position: 'top', size: 3, color: 'rgba(161, 136, 127, 0.85)' },
      },
    });
    expect(snapshot.nodes[0].data).toEqual({ description: 'Original' });
  });

  it('returns the original snapshot outside a rendered browser root', () => {
    const snapshot = { nodes: [], edges: [] };
    expect(enrichSnapshotWithRenderedNodeStyles(snapshot, document.createElement('div'))).toBe(snapshot);
  });

  it('normalizes zoom-snapped subpixel borders without altering fractional accents', () => {
    document.body.innerHTML = `
      <div data-vizly-export-node-id="node-1" style="border:0.56px solid rgb(10,20,30)">
        <div data-vizly-export-node-accent="true" style="width:0.56px;height:40px;background-color:rgb(10,20,30)"></div>
      </div>`;
    const result = enrichSnapshotWithRenderedNodeStyles({
      nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} } as Node],
      edges: [],
    }, document);

    expect(result.nodes[0].data?.__vizlyExportStyle).toMatchObject({
      strokeWidth: 1,
      accent: { position: 'left', size: 0.56 },
    });
  });
});
