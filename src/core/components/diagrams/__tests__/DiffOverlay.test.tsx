// @vitest-environment jsdom

import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';
import type { DiffResult } from '../../../utils/diagramDiff';
import DiffOverlay from '../DiffOverlay';

const { translate } = vi.hoisted(() => {
  const messages: Record<string, string> = {
    'designer.diffOverlay.regionLabel': 'Diff comparison results',
    'designer.diffOverlay.previousComparison': 'Compared with previous action',
    'designer.diffOverlay.noChanges': 'These versions are identical',
    'designer.diffOverlay.close': 'Close',
    'designer.diffOverlay.closeLabel': 'Close diff comparison',
    'designer.diffOverlay.summaryNode_one': '{{count}} node',
    'designer.diffOverlay.summaryNode_other': '{{count}} nodes',
    'designer.diffOverlay.summaryEdge_one': '{{count}} edge',
    'designer.diffOverlay.summaryEdge_other': '{{count}} edges',
    'designer.diffOverlay.addedCount': 'Added {{count}}',
    'designer.diffOverlay.removedCount': 'Removed {{count}}',
    'designer.diffOverlay.modifiedCount': 'Modified {{count}}',
    'designer.diffOverlay.addedNodesTitle': 'Added nodes:',
    'designer.diffOverlay.removedNodesTitle': 'Removed nodes:',
    'designer.diffOverlay.modifiedNodesTitle': 'Modified nodes:',
    'designer.diffOverlay.addedEdgesTitle': 'Added edges:',
    'designer.diffOverlay.removedEdgesTitle': 'Removed edges:',
    'designer.diffOverlay.modifiedEdgesTitle': 'Modified edges:',
    'designer.diffOverlay.addedNode': 'Added node {{index}}',
    'designer.diffOverlay.unnamedNode': 'Unnamed node {{index}}',
    'designer.diffOverlay.addedEdge': 'Added edge {{index}}',
    'designer.diffOverlay.unnamedEdge': 'Unnamed edge {{index}}',
    'designer.diffOverlay.modifiedEdge': 'Edge {{index}}',
    'designer.diffOverlay.changeCount_one': '{{count}} change',
    'designer.diffOverlay.changeCount_other': '{{count}} changes',
  };

  return {
    translate: vi.fn((key: string, options?: { count?: number; index?: number }) => {
      const pluralKey = typeof options?.count === 'number'
        ? `${key}_${options.count === 1 ? 'one' : 'other'}`
        : key;
      const template = messages[pluralKey] ?? messages[key] ?? key;
      return template
        .replace('{{count}}', String(options?.count ?? ''))
        .replace('{{index}}', String(options?.index ?? ''));
    }),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

const completeDiff: DiffResult = {
  addedNodes: ['node-added'],
  removedNodes: [{ id: 'node-removed', label: 'Old approval node' }],
  modifiedNodes: [{
    id: 'node-modified',
    label: 'Approval node',
    changes: [{ key: 'position', oldValue: { x: 0, y: 0 }, newValue: { x: 40, y: 0 } }],
  }],
  addedEdges: ['edge-added'],
  removedEdges: [{ id: 'edge-removed', label: 'Old approval edge' }],
  modifiedEdges: [{
    id: 'edge-modified',
    changes: [{ key: 'source', oldValue: 'a', newValue: 'b' }],
  }],
  hasDiff: true,
};

const emptyDiff: DiffResult = {
  addedNodes: [],
  removedNodes: [],
  modifiedNodes: [],
  addedEdges: [],
  removedEdges: [],
  modifiedEdges: [],
  hasDiff: false,
};

describe('DiffOverlay', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('announces the comparison and exposes complete node and edge details', () => {
    render(
      <DiffOverlay
        diff={completeDiff}
        onClose={vi.fn()}
      />,
    );

    const region = screen.getByRole('region', { name: 'Diff comparison results' });
    expect(screen.getByText('Compared with previous action')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('+1 node  -1 node  ~1 node  +1 edge  -1 edge  ~1 edge');
    expect(screen.getByText('Added 2')).toBeTruthy();
    expect(screen.getByText('Removed 2')).toBeTruthy();
    expect(screen.getByText('Modified 2')).toBeTruthy();
    expect(screen.getByText('Added node 1')).toBeTruthy();
    expect(screen.getByText('Old approval node')).toBeTruthy();
    expect(screen.getByText('Added edge 1')).toBeTruthy();
    expect(screen.getByText('Old approval edge')).toBeTruthy();
    expect(screen.getByText('Edge 1 (1 change)')).toBeTruthy();
    expect(region.textContent).not.toContain('node-added');
    expect(region.textContent).not.toContain('edge-modified');
    expect(region.textContent).not.toMatch(/差异|新增|删除|修改|关闭|节点|连线|项/);
  });

  it('focuses the exit, closes with Escape, and returns focus to document actions', () => {
    const onClose = vi.fn();

    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" data-diff-focus-return>Document actions</button>
          {open ? (
            <DiffOverlay
              diff={completeDiff}
              onClose={() => {
                onClose();
                setOpen(false);
              }}
            />
          ) : null}
        </>
      );
    };

    render(<Harness />);
    const closeButton = screen.getByRole('button', { name: 'Close diff comparison' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Diff comparison results' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Document actions' }));
  });

  it('states when two versions are identical without decorative symbols', () => {
    render(<DiffOverlay diff={emptyDiff} onClose={vi.fn()} />);

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('These versions are identical');
    expect(screen.getByRole('region', { name: 'Diff comparison results' }).textContent).not.toContain('✅');
  });

  it('ships complete English and Chinese translation contracts', () => {
    expect(en.designer.diffOverlay).toMatchObject({
      regionLabel: 'Diff comparison results',
      previousComparison: 'Compared with previous action',
      closeLabel: 'Close diff comparison',
    });
    expect(zh.designer.diffOverlay).toMatchObject({
      regionLabel: '差异对比结果',
      previousComparison: '与上一次操作对比',
      closeLabel: '关闭差异对比',
    });
    expect(en.designer.diffOverlay.summaryNode_one).toContain('{{count}}');
    expect(en.designer.diffOverlay.summaryNode_other).toContain('{{count}}');
    expect(zh.designer.diffOverlay.summaryNode).toContain('{{count}}');
  });

  it('keeps the overlay below the product header with touch-safe exit and reduced motion', () => {
    const css = readFileSync(resolve('src/core/components/diagrams/DiffOverlay.css'), 'utf8');

    expect(css).toMatch(/\.diff-overlay-bar[\s\S]*?top: calc\(56px \+ env\(safe-area-inset-top, 0px\)\);/);
    expect(css).toMatch(/\.diff-close-btn[\s\S]*?min-width: var\(--commercial-touch-target, 44px\);[\s\S]*?min-height: var\(--commercial-touch-target, 44px\);/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?left: 12px;[\s\S]*?right: 12px;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;/);
  });
});
