// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { renderDatabasePath } from '../../scripts/database-path.mjs';
const root = new URL('../database-paths/', import.meta.url);
describe('database path delivery', () => {
  it('preserves all historical migration bytes and checks generated definitions against reviewed components', () => {
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
    for (const [name, digest] of Object.entries(manifest.historicalFiles)) {
      expect(createHash('sha256').update(readFileSync(new URL(`../migrations/${name}`, root))).digest('hex')).toBe(digest);
    }
    const result = spawnSync(process.execPath, ['scripts/build-database-paths.mjs', '--check'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
  it('separates empty baseline from forward-only upgrade and owns one transaction', () => {
    const empty = renderDatabasePath('empty'); const upgrade = renderDatabasePath('upgrade');
    expect(empty).toContain('Baseline requires an empty application schema');
    expect(upgrade).not.toContain('Baseline requires an empty application schema');
    for (const sql of [empty, upgrade]) {
      expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
      expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
      expect(sql).toContain('Unknown Supabase migration history');
      expect(sql).toContain('Applied migration checksum mismatch');
      expect(sql).not.toMatch(/INSERT INTO supabase_migrations/);
      expect(sql).not.toMatch(/DROP .+ CASCADE/i);
    }
  });
  it('requires an explicit mode and emits read-only inventory independently of migration history', () => {
    expect(() => renderDatabasePath('')).toThrow('Usage');
    expect(() => renderDatabasePath('../migrations')).toThrow('Usage');
    const inventory = renderDatabasePath('inventory');
    expect(inventory).toContain('BEGIN READ ONLY');
    expect(inventory).toContain('version-reference-audit');
    expect(inventory).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  });
});
