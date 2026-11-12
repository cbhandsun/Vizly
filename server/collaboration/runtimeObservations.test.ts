// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeObservations, type RuntimeObservation } from './runtimeObservations.js';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
describe('content-free runtime observations', () => {
  it('uses distinct fresh instance and admission IDs with frozen fixed-field samples', () => {
    const samples: RuntimeObservation[] = [];
    const first = createRuntimeObservations(sample => samples.push(sample));
    const second = createRuntimeObservations();
    const a = first.admission(), b = first.admission();
    expect(first.instanceId).toMatch(uuid); expect(second.instanceId).toMatch(uuid);
    expect(first.instanceId).not.toBe(second.instanceId);
    expect(a.admissionId).toMatch(uuid); expect(b.admissionId).toMatch(uuid);
    expect(a.admissionId).not.toBe(b.admissionId);
    first.event('server-ready'); a.event('upgrade-started'); b.event('upgrade-started');
    first.subscription({ status: 'SUBSCRIBED', reason: 'none' });
    expect(samples.map(sample => sample.event)).toEqual(['server-ready', 'upgrade-started', 'upgrade-started', 'private-subscription']);
    for (const sample of samples) {
      expect(Object.isFrozen(sample)).toBe(true); expect(sample.instanceId).toBe(first.instanceId);
      expect(Number.isFinite(sample.elapsedMs)).toBe(true); expect(sample.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(Object.keys(sample).sort()).toEqual((sample.event === 'private-subscription'
        ? ['instanceId', 'event', 'elapsedMs', 'status', 'reason']
        : 'admissionId' in sample ? ['instanceId', 'admissionId', 'event', 'elapsedMs'] : ['instanceId', 'event', 'elapsedMs']).sort());
    }
  });
  it('cannot leak arbitrary subscription fields or upstream category text', () => {
    const observe = vi.fn(); const observations = createRuntimeObservations(observe);
    Reflect.apply(observations.subscription, undefined, [{ status: 'PRIVATE_SENTINEL', reason: 'PRIVATE_SENTINEL', token: 'PRIVATE_SENTINEL' }]);
    expect(observe).toHaveBeenCalledWith({ instanceId: observations.instanceId,
      event: 'private-subscription', status: 'unknown', reason: 'other', elapsedMs: expect.any(Number) });
    expect(JSON.stringify(observe.mock.calls)).not.toContain('PRIVATE_SENTINEL');
  });
  it('isolates observer exceptions from every observation path', () => {
    const observations = createRuntimeObservations(() => { throw new Error('PRIVATE_SENTINEL'); });
    expect(() => {
      observations.event('server-ready'); observations.admission().event('room-ready');
      observations.subscription({ status: 'CHANNEL_ERROR', reason: 'transport' });
      observations.event('server-stopping'); observations.event('server-stopped');
    }).not.toThrow();
  });
});
