import { describe, expect, it } from 'vitest';
import {
  ownNodeConfigRecords,
  validateNodeConfig
} from '../NodeFactoryBoundary';

const validConfig = () => ({
  id: 'node-1',
  description: 'Node 1',
  position: { x: 10, y: 20 },
  domainClass: 'generic',
});

describe('NodeFactoryBoundary', () => {
  it('accepts a valid finite node config', () => {
    expect(validateNodeConfig(validConfig())).toEqual({
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  it('rejects malformed required fields and non-finite geometry', () => {
    expect(validateNodeConfig(null).errors).toContain('节点配置必须是对象');
    expect(validateNodeConfig({ ...validConfig(), id: 1 }).errors).toContain('节点ID不能为空');
    expect(validateNodeConfig({ ...validConfig(), description: ' ' }).errors).toContain('节点描述不能为空');
    expect(validateNodeConfig({ ...validConfig(), position: { x: Number.NaN, y: 0 } }).errors).toContain(
      '节点位置必须是范围有效的有限数字'
    );
    expect(validateNodeConfig({ ...validConfig(), width: Number.POSITIVE_INFINITY }).errors).toContain(
      '节点宽度必须是有效正数'
    );
    expect(validateNodeConfig({ ...validConfig(), height: 0 }).errors).toContain('节点高度必须是有效正数');
    expect(validateNodeConfig({ ...validConfig(), zIndex: Number.NaN }).errors).toContain(
      'zIndex必须是范围有效的有限数字'
    );
  });

  it('rejects wrong-shaped mutable records and oversized text', () => {
    expect(validateNodeConfig({ ...validConfig(), style: new Date() }).errors).toContain('style必须是普通对象');
    expect(validateNodeConfig({ ...validConfig(), data: [] }).errors).toContain('data必须是普通对象');
    expect(validateNodeConfig({ ...validConfig(), description: 'x'.repeat(64 * 1024 + 1) }).errors).toContain(
      '节点描述超过长度限制'
    );
  });

  it('owns mutable records and strips dangerous nested keys', () => {
    const config = {
      ...validConfig(),
      style: { opacity: 0.5 },
      data: JSON.parse('{"safe":{"enabled":true},"__proto__":{"polluted":true}}'),
      metadata: { source: 'test' },
    };
    const owned = ownNodeConfigRecords(config);
    config.position.x = 99;
    config.style.opacity = 1;
    config.data.safe.enabled = false;
    config.metadata.source = 'changed';

    expect(owned.position.x).toBe(10);
    expect(owned.style.opacity).toBe(0.5);
    expect(owned.data.safe.enabled).toBe(true);
    expect(Object.hasOwn(owned.data, '__proto__')).toBe(false);
    expect(owned.metadata.source).toBe('test');
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});
