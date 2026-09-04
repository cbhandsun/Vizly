// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';

import { enrichSnapshotWithRenderedNodeStyles } from '../reactFlowDomSnapshotStyles';
import {
  normalizeRenderLinearGradient,
  parseRenderedLinearGradient,
} from '../renderLinearGradient';

describe('parseRenderedLinearGradient', () => {
  it('captures a bounded computed CSS gradient behind another background layer', () => {
    expect(parseRenderedLinearGradient(
      'url("data:image/svg+xml,noise"), linear-gradient(color(srgb 0.618824 0.696471 0.767059) 0%, rgb(147, 169, 189) 60%, color(srgb 0.530353 0.609726 0.681882) 100%)',
    )).toEqual([
      'rgb(158, 178, 196)',
      'rgb(147, 169, 189)',
      'rgb(135, 155, 174)',
    ]);
  });

  it('normalizes a computed vertical three-stop title gradient', () => {
    expect(parseRenderedLinearGradient('linear-gradient(#123456 0%, #456789 60%, rgba(1, 2, 3, 0.4) 100%)')).toEqual([
      '#123456',
      '#456789',
      'rgba(1, 2, 3, 0.4)',
    ]);
  });

  it.each([
    undefined,
    '',
    'repeating-linear-gradient(red 0%, blue 100%)',
    'linear-gradient(red)',
    'linear-gradient(color(srgb 2 0 0) 0%, green 60%, blue 100%)',
    'linear-gradient(red 0%, green, blue 100%)',
    'linear-gradient(red 80%, blue 20%)',
    'linear-gradient(red, blue, green, white, black)',
    `linear-gradient(red, blue)${' '.repeat(4_100)}`,
    'url(javascript:alert(1))',
  ])('rejects empty, unsupported, malformed, extreme, or unsafe input %#', value => {
    expect(parseRenderedLinearGradient(value)).toBeUndefined();
  });

  it('rejects forged scene gradient objects at the model boundary', () => {
    expect(normalizeRenderLinearGradient([
      '#fff',
      '#eee',
      'url(javascript:alert(1))',
    ])).toBeUndefined();
    expect(normalizeRenderLinearGradient([])).toBeUndefined();
  });
});

describe('enrichSnapshotWithRenderedNodeStyles', () => {
  it('captures bounded rendered custom-node styles without mutating the source snapshot', () => {
    document.body.innerHTML = `
      <div id="diagram-test">
        <div data-vizly-export-node-id="node-1" style="background-color: rgb(247, 244, 243); border: 1px solid rgba(166, 126, 112, 0.55); border-radius: 8px; box-shadow: rgba(0, 0, 0, 0.12) 0px 4px 12px; padding: 26px 16px 23px">
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
        shadow: 'rgba(0, 0, 0, 0.12)',
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

  it('captures rendered container body, header and solid-border styles', () => {
    document.body.innerHTML = `
      <div data-vizly-export-node-id="domain" style="border:0.56px solid rgb(133,164,192);border-radius:6px">
        <div data-vizly-export-node-header="true" data-vizly-export-node-content="true"
          style="height:50px;background:linear-gradient(rgb(158,178,196) 0%,rgb(147,169,189) 60%,rgb(135,155,174) 100%);color:rgb(31,41,55);font-size:16px;font-weight:700;text-transform:uppercase"></div>
        <div data-vizly-export-node-body="true" style="background-color:rgb(255,255,255)"></div>
      </div>`;
    const result = enrichSnapshotWithRenderedNodeStyles({
      nodes: [{ id: 'domain', type: 'titleGroup', position: { x: 0, y: 0 }, data: {} } as Node],
      edges: [],
    }, document);

    expect(result.nodes[0].data?.__vizlyExportStyle).toMatchObject({
      fill: 'rgb(255, 255, 255)',
      stroke: 'rgb(133, 164, 192)',
      strokeWidth: 1,
      strokeDasharray: '',
      headerFill: 'rgb(158, 178, 196)',
      headerGradient: [
        'rgb(158, 178, 196)',
        'rgb(147, 169, 189)',
        'rgb(135, 155, 174)',
      ],
      headerTextColor: 'rgb(31, 41, 55)',
      headerHeight: 50,
      headerOpacity: 1,
      headerFontSize: 16,
      headerFontWeight: '700',
      headerTextTransform: 'uppercase',
    });
  });
});
