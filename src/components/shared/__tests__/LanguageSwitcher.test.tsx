// @vitest-environment jsdom

import { cloneElement, type KeyboardEventHandler, type MouseEventHandler, type ReactElement, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    role?: 'menuitem' | 'menuitemradio';
    'aria-checked'?: boolean;
}

interface MockDropdownProps {
  children: ReactElement<{
    onClick?: MouseEventHandler<HTMLButtonElement>;
  }>;
  onOpenChange?: (open: boolean, info: { source: 'trigger' | 'menu' }) => void;
  open?: boolean;
  overlayClassName?: string;
  menu: {
    id?: string;
    'aria-label'?: string;
    items?: Array<MockMenuItem | null>;
    onClick?: (info: { key: string }) => void;
    onKeyDown?: KeyboardEventHandler<HTMLUListElement>;
  };
}

vi.mock('antd', () => ({
  Dropdown: ({ children, menu, onOpenChange, open = false, overlayClassName }: MockDropdownProps) => {
    const trigger = cloneElement(children, {
      onClick: event => {
        children.props.onClick?.(event);
        onOpenChange?.(!open, { source: 'trigger' });
      },
    });

    return (
      <div>
        {trigger}
        {open ? (
          <div className={overlayClassName}>
            <ul
              id={menu.id}
              role="menu"
              aria-label={menu['aria-label']}
              onKeyDown={menu.onKeyDown}
            >
              {(menu.items ?? []).flatMap(item => item ? [(
                <li
                  key={item.key}
                  role={item.role ?? 'menuitem'}
                  aria-checked={item['aria-checked']}
                  tabIndex={-1}
                  onClick={event => {
                    event.stopPropagation();
                    menu.onClick?.({ key: item.key });
                    onOpenChange?.(false, { source: 'menu' });
                  }}
                >
                  {item.label}
                </li>
              )] : [])}
            </ul>
          </div>
        ) : null}
      </div>
    );
  },
  Select: () => null,
}));

import { LanguageSwitcher } from '../LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    Object.values(languageState).forEach(mock => mock.mockClear());
    languageState.get.mockReturnValue(null);
  });

  it('switches to a supported language, persists the preference, and restores focus', async () => {
    render(<LanguageSwitcher variant="icon" />);

    const trigger = screen.getByRole('button', { name: 'Language: English' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: '中文' }));

    expect(languageState.changeLanguage).toHaveBeenCalledWith('zh');
    expect(languageState.set).toHaveBeenCalledWith('i18n.language', 'zh', 'user');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('exposes popup state and focuses the checked language for keyboard users', async () => {
    render(<LanguageSwitcher variant="icon" />);

    const trigger = screen.getByRole('button', { name: 'Language: English' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const menu = await screen.findByRole('menu', { name: 'Language' });
    const selectedItem = screen.getByRole('menuitemradio', { name: 'English' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(selectedItem.getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(selectedItem));
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
