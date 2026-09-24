import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../MarkdownMessage', () => ({
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

vi.mock('../ShortcutsGuide', () => ({
  default: () => <span>shortcuts-guide</span>,
}));

import { MemoizedMessageItem } from '../AIChatMessageItem';

const translate = (key: string) => key;

describe('AIChatMessageItem', () => {
  it('exposes accessible JSON actions and forwards validated content', async () => {
    const onPreviewJson = vi.fn();
    const onApplyJson = vi.fn();
    render(
      <MemoizedMessageItem
        item={{
          id: 'assistant',
          role: 'assistant',
          content: 'answer',
          hasJson: true,
          jsonContent: '{"version":1}',
        }}
        t={translate}
        onPreviewJson={onPreviewJson}
        onApplyJson={onApplyJson}
      />,
    );
    await screen.findByText('answer');

    fireEvent.click(screen.getByRole('button', { name: 'aiChat.previewJson' }));
    fireEvent.click(screen.getByRole('button', { name: /应用图表/ }));
    expect(onPreviewJson).toHaveBeenCalledWith('{"version":1}');
    expect(onApplyJson).toHaveBeenCalledWith('{"version":1}');
    expect(screen.getByRole('button', { name: 'aiChat.saveDiagram' })).not.toBeNull();
  });

  it('rerenders when JSON content changes while the JSON flag stays enabled', async () => {
    const onPreviewJson = vi.fn();
    const base = {
      id: 'assistant',
      role: 'assistant' as const,
      content: 'answer',
      hasJson: true,
    };
    const { rerender } = render(
      <MemoizedMessageItem
        item={{ ...base, jsonContent: '{"version":1}' }}
        t={translate}
        onPreviewJson={onPreviewJson}
      />,
    );
    await screen.findByText('answer');
    rerender(
      <MemoizedMessageItem
        item={{ ...base, jsonContent: '{"version":2}' }}
        t={translate}
        onPreviewJson={onPreviewJson}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'aiChat.previewJson' }));
    expect(onPreviewJson).toHaveBeenCalledWith('{"version":2}');
  });

  it('does not expose diagram actions for user messages', async () => {
    render(
      <MemoizedMessageItem
        item={{ id: 'user', role: 'user', content: 'hello', hasJson: true, jsonContent: '{}' }}
        t={translate}
      />,
    );
    await screen.findByText('hello');

    expect(screen.queryByRole('button', { name: 'aiChat.previewJson' })).toBeNull();
  });
});
