// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coerceSupportedLanguage,
  parseSupportedLanguage,
  syncDocumentLanguage,
} from '@/core/utils/languagePreference';

const languageState = vi.hoisted(() => ({
  changeLanguage: vi.fn(async () => undefined),
  get: vi.fn((): unknown => null),
  set: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'common.language' ? 'Language' : key,
    i18n: {
      language: 'en',
      resolvedLanguage: 'en',
      changeLanguage: languageState.changeLanguage,
    },
  }),
}));

vi.mock('@/core/config/LayeredConfigManager', () => ({
  ConfigLayer: { USER: 'user' },
  LayeredConfigManager: {
    getInstance: () => ({
      get: languageState.get,
      set: languageState.set,
      addListener: languageState.addListener,
      removeListener: languageState.removeListener,
    }),
  },
}));

interface MockMenuItem {
  key: string;
  label: ReactNode;
}

interface MockDropdownProps {
  children: ReactNode;
  menu: {
    items?: Array<MockMenuItem | null>;
    onClick?: (info: { key: string }) => void;
  };
}

vi.mock('antd', () => ({
  Dropdown: ({ children, menu }: MockDropdownProps) => (
    <div>
      {children}
      {(menu.items ?? []).flatMap(item => item ? [(
        <button type="button" key={item.key} onClick={() => menu.onClick?.({ key: item.key })}>
          {item.label}
        </button>
      )] : [])}
    </div>
  ),
  Select: () => null,
}));

import { LanguageSwitcher } from '../LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    Object.values(languageState).forEach(mock => mock.mockClear());
    languageState.get.mockReturnValue(null);
  });

  it('switches to a supported language and persists the preference', () => {
    render(<LanguageSwitcher variant="icon" />);

    expect(screen.getByRole('button', { name: 'Language' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '🇨🇳 中文' }));

    expect(languageState.changeLanguage).toHaveBeenCalledWith('zh');
    expect(languageState.set).toHaveBeenCalledWith('i18n.language', 'zh', 'user');
  });

  it('ignores an unsupported stored language', () => {
    languageState.get.mockReturnValue('javascript:alert(1)');
    render(<LanguageSwitcher variant="icon" />);

    expect(languageState.changeLanguage).not.toHaveBeenCalled();
  });

  it('normalizes supported regional language values', () => {
    expect(parseSupportedLanguage('EN-us')).toBe('en');
    expect(parseSupportedLanguage('zh_CN')).toBe('zh');
  });

  it('rejects unsafe values and synchronizes a safe document language', () => {
    const target = { documentElement: { lang: 'zh' } };

    expect(parseSupportedLanguage('')).toBeNull();
    expect(parseSupportedLanguage('fr')).toBeNull();
    expect(parseSupportedLanguage({ language: 'en' })).toBeNull();
    expect(coerceSupportedLanguage('<script>', 'zh')).toBe('zh');
    expect(syncDocumentLanguage('<script>', target)).toBe('en');
    expect(target.documentElement.lang).toBe('en');
  });
});
