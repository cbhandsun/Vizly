import { describe, expect, it } from 'vitest';

import {
  createContainerNodeAccessibilityProps,
  toContainerAccessibleText,
} from '../containerNodeAccessibility';

describe('container node accessibility', () => {
  it('converts sanitized inline markup into a bounded plain-text label', () => {
    expect(toContainerAccessibleText('<b>订单</b><br>处理', '组合')).toBe('订单 处理');
    expect(toContainerAccessibleText('<img src=x onerror=alert(1)>安全组', '组合')).toBe('安全组');
    expect(toContainerAccessibleText('', '组合')).toBe('组合');
    expect(toContainerAccessibleText('x'.repeat(400), '组合')).toHaveLength(256);
  });

  it('exposes tree-item selection and expansion state when children exist', () => {
    expect(createContainerNodeAccessibilityProps({
      accessibleName: '组合节点：订单，已折叠，2 个子节点',
      selected: true,
      collapsed: true,
      childCount: 2,
    })).toEqual({
      role: 'treeitem',
      tabIndex: 0,
      'aria-label': '组合节点：订单，已折叠，2 个子节点',
      'aria-selected': true,
      'aria-expanded': false,
    });
  });

  it('omits expansion state for an empty container', () => {
    const props = createContainerNodeAccessibilityProps({
      accessibleName: '组合节点：空组，已展开，0 个子节点',
      selected: false,
      collapsed: false,
      childCount: 0,
    });

    expect(props['aria-expanded']).toBeUndefined();
    expect(props['aria-selected']).toBe(false);
  });
});
