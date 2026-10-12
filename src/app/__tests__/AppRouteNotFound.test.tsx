import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppRouteNotFound from '../AppRouteNotFound';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/locales/en.json';
import zh from '@/locales/zh.json';

describe('AppRouteNotFound', () => {
  it.each(['en', 'zh'])('offers localized safe recovery without echoing an untrusted route: %s', async language => {
    const onGoBack = vi.fn();
    const onReturnToProjects = vi.fn();

    const i18n = createInstance();
    await i18n.init({ lng: language, resources: { en: { translation: en }, zh: { translation: zh } }, interpolation: { escapeValue: false } });
    const copy = language === 'zh' ? zh.routeNotFound : en.routeNotFound;
    render(
      <I18nextProvider i18n={i18n}>
      <AppRouteNotFound
        onGoBack={onGoBack}
        onReturnToProjects={onReturnToProjects}
      />
      </I18nextProvider>,
    );

    const projects = screen.getByRole('button', { name: copy.projects });
    const back = screen.getByRole('button', { name: copy.back });

    await waitFor(() => expect(document.activeElement).toBe(projects));
    const statusText = screen.getByRole('status').textContent ?? '';
    expect(statusText).toContain(copy.title);
    expect(statusText).not.toContain('/private/customer-diagram');

    fireEvent.click(projects);
    fireEvent.click(back);

    expect(onReturnToProjects).toHaveBeenCalledTimes(1);
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });
});
