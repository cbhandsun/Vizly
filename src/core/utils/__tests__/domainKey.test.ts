import { describe, expect, it } from 'vitest';
import {
  DOMAIN_ROLE_FALLBACK,
  DOMAIN_SYNONYMS,
  deriveDomainClassFromDomain,
  getDomainTheme,
  resolveThemeDomainKey,
} from '../domainKey';
import type { Theme } from '../../themes/types/ThemeTypes';

const color = (main: string) => ({ main });

const themeWithDomains = (domains: Record<string, unknown>): Theme => ({
  id: 'theme',
  name: 'theme',
  mode: 'light',
  diagram: { domains },
} as unknown as Theme);

describe('domainKey', () => {
  it.each([
    [{ domainClass: 'fe' }, ['fe', 'frontend'], 'fe'],
    [{ domainClass: 'frontend' }, ['fe'], 'fe'],
    [{ domainClass: 'external-system' }, ['ch'], 'ch'],
    [{ domainClass: 'database' }, ['data'], 'data'],
    [{ domainClass: 'be_scm' }, ['be-scm'], 'be-scm'],
    [{ domainClass: 'beLogistics' }, ['be-logistics'], 'be-logistics'],
    [{ domainClass: '仓库管理' }, ['be-scm'], 'be-scm'],
    [{ domainClass: '运输' }, ['be-logistics'], 'be-logistics'],
    [{ domainClass: '集团' }, ['be-corp'], 'be-corp'],
    [{ domainClass: 'unknown', domain: 'middleware' }, ['mid'], 'mid'],
  ] as Array<[Parameters<typeof resolveThemeDomainKey>[1], string[], string]>)(
    'resolves aliases and normalized domain classes for %o',
    (source, domainKeys, expected) => {
      const domains = Object.fromEntries(domainKeys.map(key => [key, color(key)]));
      expect(resolveThemeDomainKey(themeWithDomains(domains), source)).toBe(expected);
    }
  );

  it('falls back through equivalent keys, backend, role keys, first domain, and frontend literal', () => {
    expect(resolveThemeDomainKey(themeWithDomains({ external: color('external') }), {
      domainClass: 'ch',
    })).toBe('external');

    expect(resolveThemeDomainKey(themeWithDomains({ backend: color('backend') }), {
      domainClass: 'be-corp',
    })).toBe('backend');

    expect(resolveThemeDomainKey(themeWithDomains({ middleware: color('middleware') }), {
      domainClass: 'strategy',
    })).toBe('middleware');

    expect(resolveThemeDomainKey(themeWithDomains({ data: color('data') }), {
      domainClass: 'unknown',
    })).toBe('data');

    expect(resolveThemeDomainKey(undefined, { domainClass: 'unknown' })).toBe('frontend');
  });

  it('supports legacy theme.domains and returns matching domain theme colors', () => {
    const legacyTheme = {
      domains: {
        external: color('#123456'),
        backend: color('#abcdef'),
      },
    } as unknown as Theme;

    expect(resolveThemeDomainKey(legacyTheme, { domainClass: 'channel' })).toBe('external');
    expect(getDomainTheme(legacyTheme, { domainClass: 'be-scm' })).toEqual(color('#abcdef'));
    expect(getDomainTheme(undefined, { domainClass: 'fe' })).toBeUndefined();
  });

  it.each([
    ['', undefined],
    [' ch ', 'ch'],
    ['external', 'ch'],
    ['frontend', 'fe'],
    ['middleware', 'mid'],
    ['database', 'data'],
    ['wms', 'be-scm'],
    ['wms-outbound', 'be-scm'],
    ['tms', 'be-logistics'],
    ['logistics', 'be-logistics'],
    ['yms', 'be-logistics'],
    ['customs', 'be-logistics'],
    ['unknown', undefined],
  ])('derives domainClass from domain %s', (domain, expected) => {
    expect(deriveDomainClassFromDomain(domain)).toBe(expected);
  });

  it('exports synonym and role fallback maps for shared callers', () => {
    expect(DOMAIN_SYNONYMS['前端']).toBe('fe');
    expect(DOMAIN_SYNONYMS.routing).toBe('be-logistics');
    expect(DOMAIN_ROLE_FALLBACK.core).toBe('frontend');
    expect(DOMAIN_ROLE_FALLBACK.interface).toBe('external');
  });
});
