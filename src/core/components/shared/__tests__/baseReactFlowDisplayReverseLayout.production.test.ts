// @vitest-environment node
import { expect, it } from 'vitest';
import { tmsReverseLayoutRequest } from './fixtures/tmsReverseLayoutRequest';
import { tmsReverseHorizontalLayoutRequest } from './fixtures/tmsReverseHorizontalLayoutRequest';
import { parseDisplayEdgesWorkerRequest } from '../baseReactFlowDisplayWorkerProtocol';
import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';

it.each([
  ['BT', tmsReverseLayoutRequest], ['RL', tmsReverseHorizontalLayoutRequest],
] as const)('commits the real TMS %s layout through the complete Worker transaction within its unchanged deadline', (direction, fixture) => {
  const request = parseDisplayEdgesWorkerRequest(structuredClone(fixture));
  if (!request) throw new Error('Invalid production regression fixture');
  const before = structuredClone(request);
  const start = performance.now();
  const result = computeBaseReactFlowDisplayEdgesWorkerResponse(request);
  expect(performance.now() - start).toBeLessThan(30_000);
  expect(result.hardClean, JSON.stringify(result.hardReport)).toBe(true);
  expect(result.edges).toHaveLength(17);
  expect(result.commitReceipt?.identity).toEqual(request.inputIdentity);
  expect(result.sessionRef?.identity).toEqual(request.inputIdentity);
  expect(result.outputRouteSignature).toBe(result.commitReceipt?.outputRouteSignature);
  if (!result.edges) throw new Error('Missing final routes');
  expect(getExactDisplayHardReport(result.edges, request.nodes).hardClean).toBe(true);
  expect(result.edges.every(edge => edge.data?.layoutDirection === direction)).toBe(true);
  expect(request).toEqual(before);
}, 30_000);
