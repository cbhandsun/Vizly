// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDiagramOperationScope } from '../useDiagramOperationScope';

describe('useDiagramOperationScope', () => {
  it('keeps a stable getter while tracking committed diagram and active page changes', () => {
    let pageOperationScope = 'page-1:0';
    const getPageOperationScope = () => pageOperationScope;
    const { result, rerender } = renderHook(
      ({ diagramId }) => useDiagramOperationScope(diagramId, getPageOperationScope),
      { initialProps: { diagramId: 'diagram-1' } },
    );
    const getScope = result.current;

    expect(getScope()).toBe('diagram-1:page-1:0');

    pageOperationScope = 'page-2:1';
    expect(getScope()).toBe('diagram-1:page-2:1');

    rerender({ diagramId: 'diagram-2' });
    expect(result.current).toBe(getScope);
    expect(getScope()).toBe('diagram-2:page-2:1');
  });
});
