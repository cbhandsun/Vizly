// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseProductionCollaborationConfiguration } from './productionConfiguration.js';
const environment = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SYNTHETIC_ONLY',
  SUPABASE_SERVER_KEY: 'sb_secret_SYNTHETIC_ONLY', VIZLY_COLLABORATION_ORIGINS: 'https://vizly.example.com' };
describe('production collaboration environment boundary', () => {
  it('keeps credentials separate and normalizes the backend HTTPS origin', () => {
    const config = parseProductionCollaborationConfiguration({ ...environment, SUPABASE_URL: environment.SUPABASE_URL + '/',
      VIZLY_COLLABORATION_ORIGINS: 'https://vizly.example.com,https://preview.example.com' });
    expect(config.supabaseUrl).toBe(environment.SUPABASE_URL); expect(config.serverKey).toBe(environment.SUPABASE_SERVER_KEY);
    expect([...config.origins]).toEqual(['https://vizly.example.com', 'https://preview.example.com']);
  });
  it('accepts legacy anonymous keys and rejects server-role JWTs in the public key slot', () => {
    const key = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
    expect(parseProductionCollaborationConfiguration({ ...environment, SUPABASE_PUBLISHABLE_KEY: key('anon') }).publishableKey).toBe(key('anon'));
    expect(() => parseProductionCollaborationConfiguration({ ...environment, SUPABASE_PUBLISHABLE_KEY: key('service_role') })).toThrow('configuration');
  });
  it.each(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVER_KEY', 'VIZLY_COLLABORATION_ORIGINS'])('rejects missing and wrongly typed %s', field => {
    for (const value of [undefined, null, '', 42, {}]) expect(() => parseProductionCollaborationConfiguration({ ...environment, [field]: value })).toThrow('configuration');
  });
  it.each(['http://localhost:5419', 'https://user:credential@vizly.example.com', 'https://vizly.example.com/path',
    'https://vizly.example.com?token=forbidden', 'https://vizly.example.com#token', '*', 'https://vizly.example.com/',
    ' https://vizly.example.com', 'https://vizly.example.com,', Array(17).fill('https://vizly.example.com').join(',')])('rejects unsafe or excessive browser origins %s', origins => {
    expect(() => parseProductionCollaborationConfiguration({ ...environment, VIZLY_COLLABORATION_ORIGINS: origins })).toThrow('configuration');
  });
  it.each(['sb_publishable_SYNTHETIC_ONLY', 'legacy-server-token', 'sb_secret_SHORT', 'sb_secret_' + 'x'.repeat(513)])('rejects invalid backend credentials without echoing them %#', serverKey => {
    expect(() => parseProductionCollaborationConfiguration({ ...environment, SUPABASE_SERVER_KEY: serverKey })).toThrow(/^Invalid production collaboration configuration$/);
  });
  it('rejects secret credentials in the public slot and malformed legacy payloads', () => {
    for (const value of ['sb_secret_SYNTHETIC_ONLY', 'header.bm90LWpzb24.signature', 'x'.repeat(4097)]) {
      expect(() => parseProductionCollaborationConfiguration({ ...environment, SUPABASE_PUBLISHABLE_KEY: value })).toThrow('configuration');
    }
  });
});
