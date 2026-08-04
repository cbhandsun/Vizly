// @vitest-environment jsdom

import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffResult } from '../../../utils/diagramDiff';
import DiffOverlay from '../DiffOverlay';

const completeDiff: DiffResult = {
  addedNodes: ['node-added'],
  removedNodes: [{ id: 'node-removed', label: '旧审批节点' }],
  modifiedNodes: [{
    id: 'node-modified',
    label: '审批节点',
    changes: [{ key: 'position', oldValue: { x: 0, y: 0 }, newValue: { x: 40, y: 0 } }],
  }],
  addedEdges: ['edge-added'],
  removedEdges: [{ id: 'edge-removed', label: '旧审批连线' }],
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
        versionLabel="与上一次操作对比"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: '差异对比结果' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('+1 节点  -1 节点  ~1 节点  +1 连线  -1 连线  ~1 连线');
    expect(screen.getByText('新增 2')).toBeTruthy();
    expect(screen.getByText('删除 2')).toBeTruthy();
    expect(screen.getByText('修改 2')).toBeTruthy();
    expect(screen.getByText('新增节点 1')).toBeTruthy();
    expect(screen.getByText('旧审批节点')).toBeTruthy();
    expect(screen.getByText('新增连线 1')).toBeTruthy();
    expect(screen.getByText('旧审批连线')).toBeTruthy();
    expect(screen.getByText('连线 1 (1项)')).toBeTruthy();
    expect(screen.getByRole('region', { name: '差异对比结果' }).textContent).not.toContain('node-added');
    expect(screen.getByRole('region', { name: '差异对比结果' }).textContent).not.toContain('edge-modified');
  });

  it('focuses the exit, closes with Escape, and returns focus to document actions', () => {
    const onClose = vi.fn();

    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" data-diff-focus-return>文档操作</button>
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
    const closeButton = screen.getByRole('button', { name: '关闭差异对比' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: '差异对比结果' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '文档操作' }));
  });

  it('states when two versions are identical without decorative symbols', () => {
    render(<DiffOverlay diff={emptyDiff} onClose={vi.fn()} />);

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('两个版本完全相同');
    expect(screen.getByRole('region', { name: '差异对比结果' }).textContent).not.toContain('✅');
  });

  it('keeps the overlay below the product header with touch-safe exit and reduced motion', () => {
    const css = readFileSync(resolve('src/core/components/diagrams/DiffOverlay.css'), 'utf8');

    expect(css).toMatch(/\.diff-overlay-bar[\s\S]*?top: calc\(56px \+ env\(safe-area-inset-top, 0px\)\);/);
    expect(css).toMatch(/\.diff-close-btn[\s\S]*?min-width: var\(--commercial-touch-target, 44px\);[\s\S]*?min-height: var\(--commercial-touch-target, 44px\);/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?left: 12px;[\s\S]*?right: 12px;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;/);
  });
});
