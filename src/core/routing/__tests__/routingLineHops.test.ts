import { describe, expect, it } from 'vitest';

import { parseRoutingLineHops } from '../routingLineHops';

describe('routingLineHops', () => {
  it.each([
    ';0,0;',
    ';1032,2293;664,2828;',
    ';-12.5,0;1000000000,-1000000000;',
  ])('accepts bounded canonical geometry: %s', value => {
    expect(parseRoutingLineHops(value)).toBe(value);
  });

  it.each([
    null,
    '',
    '0,0',
    ';;',
    ';0,0;;1,1;',
    '; 0,0;',
    ';1e2,0;',
    ';NaN,0;',
    ';1000000001,0;',
    `;${Array.from({ length: 17 }, (_, index) => `${index},0`).join(';')};`,
    `;${'1'.repeat(129)},0;`,
  ])('rejects malformed or excessive input', value => {
    expect(parseRoutingLineHops(value)).toBeNull();
  });
});
