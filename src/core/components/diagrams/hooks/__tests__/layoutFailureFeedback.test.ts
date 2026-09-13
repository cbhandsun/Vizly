import { describe, expect, it, vi } from 'vitest';

import {
  getLayoutFailureMessageKey,
  presentLayoutFailure,
  type LayoutFailureMessageApi,
} from '../layoutFailureFeedback';

const createMessageApi = () => ({
  open: vi.fn(),
}) satisfies LayoutFailureMessageApi;

describe('layoutFailureFeedback', () => {
  it('maps bounded layout failure codes to translation keys', () => {
    expect(getLayoutFailureMessageKey('no-layoutable-nodes'))
      .toBe('designer.flowchart.layout.failure.noLayoutableNodes');
    expect(getLayoutFailureMessageKey('hard-quality-rejected'))
      .toBe('designer.flowchart.layout.failure.hardQualityRejected');
    expect(getLayoutFailureMessageKey('worker-timeout'))
      .toBe('designer.flowchart.layout.failure.workerTimeout');
    expect(getLayoutFailureMessageKey('strategy-failed'))
      .toBe('designer.flowchart.layout.failure.strategyFailed');
  });

  it('presents translated content without exposing arbitrary error text', () => {
    const messageApi = createMessageApi();
    const translate = vi.fn((key: string) => `translated:${key}`);

    presentLayoutFailure(messageApi, 'hard-quality-rejected', translate);

    expect(translate).toHaveBeenCalledWith(
      'designer.flowchart.layout.failure.hardQualityRejected',
    );
    expect(messageApi.open).toHaveBeenCalledWith({
      key: 'flowchart.layout-failure',
      type: 'error',
      content: 'translated:designer.flowchart.layout.failure.hardQualityRejected',
      duration: 5,
    });
    expect(JSON.stringify(messageApi.open.mock.calls)).not.toContain('private provider payload');
  });

  it('does not present cancelled layout jobs', () => {
    const messageApi = createMessageApi();

    presentLayoutFailure(messageApi, 'cancelled', key => key);

    expect(messageApi.open).not.toHaveBeenCalled();
  });
});
