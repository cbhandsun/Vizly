import { describe, expect, it } from 'vitest';
import { FaTruck } from 'react-icons/fa';
import {
  getDiagramDataSelector,
  getDiagramIcon,
  normalizeDiagramCategory,
  normalizeDiagramId,
  normalizeThemeId,
} from '../modernDiagramMenuGuards';
import type { DiagramDefinition } from '@/core/types/diagram-components';

const diagram = (overrides: Partial<DiagramDefinition>): DiagramDefinition => ({
  id: 'demo',
  name: 'Demo',
  component: () => null,
  ...overrides,
});

describe('modernDiagramMenuGuards', () => {
  it('normalizes diagram ids for storage and selector use', () => {
    expect(normalizeDiagramId(' demo/one ')).toBe('demo/one');
    expect(normalizeDiagramId('')).toBeNull();
    expect(normalizeDiagramId('"bad"')).toBeNull();
    expect(normalizeDiagramId('x'.repeat(161))).toBeNull();
  });

  it('normalizes categories and theme ids to bounded values', () => {
    expect(normalizeDiagramCategory('architecture')).toBe('architecture');
    expect(normalizeDiagramCategory('unexpected')).toBe('other');
    expect(normalizeThemeId('dark')).toBe('dark');
    expect(normalizeThemeId('custom<script>')).toBeNull();
  });

  it('falls back when a diagram icon is not a component', () => {
    expect(getDiagramIcon(diagram({ icon: FaTruck }))).toBe(FaTruck);
    expect(getDiagramIcon(diagram({ icon: 'truck' }))).not.toBe('truck');
  });

  it('creates safe data selectors only for valid diagram ids', () => {
    expect(getDiagramDataSelector('demo/one')).toBe('[data-diagram-id="demo/one"]');
    expect(getDiagramDataSelector('"bad"')).toBeNull();
  });
});
