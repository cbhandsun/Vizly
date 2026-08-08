import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from 'antd/es/modal';
import Input from 'antd/es/input';
import Typography from 'antd/es/typography';
import Tag from 'antd/es/tag';
import { theme } from 'antd';
import type { InputRef } from 'antd';
import Button from 'antd/es/button';
import { useTranslation } from 'react-i18next';
import { FaTimes } from 'react-icons/fa';

import type { CommandGroup, CommandItem } from '../../types/plugin';
import {
  bumpCommandUsage,
  bumpRecentCommandId,
  readCommandUsage,
} from './commandPaletteStorage';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  items: CommandItem[];
  getContainer?: () => HTMLElement;
}

const GROUP_WEIGHT: Record<CommandGroup, number> = { favorites: 240, recent: 200, actions: 120, diagrams: 10 };
const GROUP_ORDER: CommandGroup[] = ['favorites', 'recent', 'actions', 'diagrams'];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onDismiss, items, ...props }) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const inputRef = useRef<InputRef>(null);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  const modKeyLabel = isMac ? '⌘' : 'Ctrl';

  const groupLabel = useCallback((g: CommandGroup): string => {
    if (g === 'favorites') return t('designer.commandPalette.group.favorites');
    if (g === 'recent') return t('designer.commandPalette.group.recent');
    if (g === 'actions') return t('designer.commandPalette.group.actions');
    return t('designer.commandPalette.group.diagrams');
  }, [t]);

  const shortcutsItem = useMemo(() => items.find(x => x.id === 'op:shortcuts'), [items]);
  const dismiss = useCallback(() => {
    (onDismiss ?? onClose)();
  }, [onClose, onDismiss]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQuery('');
      setActiveIndex(0);
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const scored = useMemo(() => {
    const q = query.trim().toLowerCase();
    const normalize = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const fuzzyScore = (needle: string, haystack: string): number => {
      if (!needle) return 0;
      if (!haystack) return -1;
      if (haystack === needle) return 9000;
      const idx = haystack.indexOf(needle);
      if (idx >= 0) {
        const startBonus = idx === 0 ? 1200 : 0;
        const wordBonus = idx > 0 && /[\s/_-]/.test(haystack[idx - 1] || '') ? 600 : 0;
        const compactBonus = Math.max(0, 500 - idx);
        return 4000 + startBonus + wordBonus + compactBonus;
      }

      let last = -1;
      let gaps = 0;
      for (const ch of needle) {
        const next = haystack.indexOf(ch, last + 1);
        if (next < 0) return -1;
        gaps += Math.max(0, next - last - 1);
        last = next;
      }
      return 1200 - Math.min(900, gaps);
    };

    const usage = readCommandUsage();

    return items
      .map((it) => {
      const hay = [
        it.title,
        it.description || '',
        ...(it.keywords || []),
        ...(it.meta || [])
      ]
        .join(' ')
        .toLowerCase()
        .trim();
        const score = q ? fuzzyScore(normalize(q), normalize(hay)) : 0;
        const usageCount = Math.max(0, Number(usage[it.id] || 0) || 0);
        const usageScore = Math.min(2000, usageCount * 60);
        return { it, score, usageScore, hay: normalize(hay) };
      })
      .filter((x) => (q ? x.score >= 0 : true))
      .sort((a, b) => {
        const gw = (GROUP_WEIGHT[b.it.group] || 0) - (GROUP_WEIGHT[a.it.group] || 0);
        if (gw !== 0) return gw;
        const ds = (b.score || 0) - (a.score || 0);
        if (ds !== 0) return ds;
        return (b.usageScore || 0) - (a.usageScore || 0);
      });
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<CommandGroup, CommandItem[]>();
    for (const x of scored) {
      const arr = map.get(x.it.group) || [];
      arr.push(x.it);
      map.set(x.it.group, arr);
    }
    return GROUP_ORDER
      .filter((g) => (map.get(g)?.length || 0) > 0)
      .map((g) => ({ group: g, items: map.get(g) || [] }));
  }, [scored]);

  const flat = useMemo(
    () => grouped.flatMap((g) => g.items).filter((item) => item.disabled !== true),
    [grouped],
  );
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    flat.forEach((it, i) => map.set(it.id, i));
    return map;
  }, [flat]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setActiveIndex((i) => Math.min(Math.max(0, i), Math.max(0, flat.length - 1)));
    });
  }, [flat.length, open]);

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current.get(activeIndex);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const highlight = (text: string): React.ReactNode => {
    const q = query.trim();
    if (!q) return text;
    const lower = text.toLowerCase();
    const needle = q.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx < 0) return text;
    const before = text.slice(0, idx);
    const mid = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span style={{ color: token.colorPrimary, fontWeight: 600 }}>{mid}</span>
        {after}
      </>
    );
  };

  const bumpUsage = useCallback((id: string) => {
    bumpCommandUsage(id);
  }, []);

  const bumpRecent = useCallback((id: string) => {
    bumpRecentCommandId(id);
    window.dispatchEvent(new CustomEvent('commandPaletteRecentChanged'));
  }, []);

  const runItem = useCallback((it: CommandItem, alt: boolean) => {
    if (it.disabled) return;
    bumpUsage(it.id);
    bumpRecent(it.id);
    if (alt && it.onAltSelect) {
      it.onAltSelect();
      onClose();
      return;
    }
    it.onSelect();
    onClose();
  }, [bumpRecent, bumpUsage, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key === '?' && !(e.ctrlKey || e.metaKey || e.altKey)) {
        if (shortcutsItem) {
          e.preventDefault();
          runItem(shortcutsItem, false);
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flat.length > 0) setActiveIndex((i) => (i + 1) % flat.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flat.length > 0) setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        if (flat.length > 0) setActiveIndex(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        if (flat.length > 0) setActiveIndex(flat.length - 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = flat[activeIndex];
        if (!it) return;
        runItem(it, !!(e.ctrlKey || e.metaKey));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, dismiss, flat, open, runItem, shortcutsItem]);

  const clearQuery = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  const resultsStatus = flat.length === 0
    ? t('designer.commandPalette.noResults')
    : t('designer.commandPalette.resultsStatus', { count: flat.length });

  return (
    <Modal
      open={open}
      onCancel={dismiss}
      footer={null}
      centered
      closable={false}
      keyboard={false}
      focusTriggerAfterClose={false}
      width={720}
      styles={{ body: { padding: 0 } }}
      {...props}
    >
      <div
        style={{
          padding: 16,
          background: token.colorBgElevated,
          border: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: token.boxShadowSecondary,
          borderRadius: 12
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-label={t('designer.commandPalette.searchAria')}
              aria-controls="command-palette-results"
              aria-activedescendant={flat[activeIndex] ? `command-palette-option-${flat[activeIndex].id}` : undefined}
              aria-keyshortcuts="ArrowDown ArrowUp Home End Enter Escape"
              placeholder={t('designer.commandPalette.placeholder', { mod: modKeyLabel })}
              size="large"
              autoComplete="off"
              style={{ minHeight: 'var(--commercial-touch-target, 44px)' }}
            />
            {query && (
              <Button
                type="text"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearQuery}
                style={{ minHeight: 'var(--commercial-touch-target, 44px)' }}
              >
                {t('designer.commandPalette.clearSearch')}
              </Button>
            )}
            <Button
              type="text"
              aria-label={t('common.close')}
              icon={<FaTimes aria-hidden="true" />}
              onClick={dismiss}
              style={{
                width: 'var(--commercial-touch-target, 44px)',
                minWidth: 'var(--commercial-touch-target, 44px)',
                height: 'var(--commercial-touch-target, 44px)',
                flex: '0 0 var(--commercial-touch-target, 44px)',
              }}
            />
          </div>
          <Typography.Text
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {resultsStatus}
          </Typography.Text>
          <div
            ref={listViewportRef}
            id="command-palette-results"
            role="listbox"
            aria-label={t('designer.commandPalette.searchAria')}
            style={{ maxHeight: 420, overflow: 'auto' }}
          >
            {flat.length === 0 && (
              <div style={{ padding: 16 }}>
                <Typography.Text type="secondary">{t('designer.commandPalette.noResults')}</Typography.Text>
              </div>
            )}
            {grouped.map((g) => (
              <div key={g.group} style={{ marginBottom: 12 }}>
                <Typography.Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    display: 'block',
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: token.colorFillTertiary,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}
                >
                  {t('designer.commandPalette.groupHeader', { group: groupLabel(g.group), count: g.items.length })}
                </Typography.Text>
                <div>
                  {g.items.map((it) => {
                    const idx = indexById.get(it.id) ?? -1;
                    const disabled = it.disabled === true;
                    const active = !disabled && idx === activeIndex;
                    return (
                      <button
                        type="button"
                        id={`command-palette-option-${it.id}`}
                        key={it.id}
                        role="option"
                        aria-selected={active}
                        disabled={disabled}
                        ref={(el) => {
                          if (!el || idx < 0) {
                            if (idx >= 0) itemRefs.current.delete(idx);
                            return;
                          }
                          itemRefs.current.set(idx, el);
                        }}
                        onMouseEnter={() => {
                          if (!disabled) setActiveIndex(idx);
                        }}
                        onClick={(e) => {
                          runItem(it, !!(e.ctrlKey || e.metaKey));
                        }}
                        style={{
                          borderRadius: 10,
                          border: 0,
                          width: '100%',
                          display: 'block',
                          textAlign: 'left',
                          color: disabled ? token.colorTextDisabled : token.colorText,
                          padding: '10px 12px',
                          minHeight: 'var(--commercial-touch-target, 44px)',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          background: active ? token.colorFillSecondary : 'transparent',
                          outline: active ? `1px solid ${token.colorPrimaryBorder}` : '1px solid transparent'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {highlight(it.title)}
                            </span>
                            {(it.meta || []).slice(0, 3).map((m) => (
                              <Tag key={m} color="default">
                                {m}
                              </Tag>
                            ))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
                            {it.shortcut && (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {it.shortcut}
                              </Typography.Text>
                            )}
                            {it.onAltSelect && (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {t('designer.commandPalette.openInNewTabHint', { mod: modKeyLabel })}
                              </Typography.Text>
                            )}
                          </div>
                        </div>
                        {it.description && (
                          <Typography.Text
                            type="secondary"
                            style={{ display: 'block', marginTop: 2, fontSize: 12 }}
                          >
                            {it.description}
                          </Typography.Text>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('designer.commandPalette.footerHint', { mod: modKeyLabel })}
            </Typography.Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {shortcutsItem && (
                <Button
                  type="text"
                  onClick={() => runItem(shortcutsItem, false)}
                  style={{
                    minWidth: 'var(--commercial-touch-target, 44px)',
                    minHeight: 'var(--commercial-touch-target, 44px)',
                  }}
                >
                  {t('designer.commandPalette.shortcutsHelp')}
                </Button>
              )}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('designer.commandPalette.toggleHint', { mod: modKeyLabel })}
              </Typography.Text>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
