import React, { useEffect, useId, useMemo, useRef } from 'react';
import { BgColorsOutlined, CheckOutlined } from '@ant-design/icons';
import { Button, Dropdown, Tooltip, theme as antdTheme } from 'antd';
import { useTranslation } from 'react-i18next';

import { getViewportPopupContainer } from '../ui/viewportOverlayPortal';
import { VIZLY_THEME_OPTIONS, VIZLY_THEMES } from './theme';

interface MindMapThemeSelectorProps {
    activeThemeKey: string;
    onOpenChange: (open: boolean) => void;
    onThemeChange: (themeKey: string) => void;
    open: boolean;
    suppressTooltip?: boolean;
}

const getNextThemeIndex = (key: string, currentIndex: number, count: number): number | null => {
    if (key === 'ArrowDown') return (currentIndex + 1) % count;
    if (key === 'ArrowUp') return (currentIndex - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
};

export const MindMapThemeSelector: React.FC<MindMapThemeSelectorProps> = ({
    activeThemeKey,
    onOpenChange,
    onThemeChange,
    open,
    suppressTooltip = false,
}) => {
    const { token } = antdTheme.useToken();
    const { t } = useTranslation();
    const menuId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const activeIndex = useMemo(
        () => Math.max(0, VIZLY_THEME_OPTIONS.findIndex(option => option.key === activeThemeKey)),
        [activeThemeKey],
    );
    const activeOption = VIZLY_THEME_OPTIONS[activeIndex];
    const activeLabel = activeOption
        ? t(`plugins.mindmap.toolbar.themeNames.${activeOption.key}`)
        : activeThemeKey;

    useEffect(() => {
        if (!open) return;
        queueMicrotask(() => itemRefs.current[activeIndex]?.focus());
    }, [activeIndex, open]);

    const closeAndRestoreFocus = () => {
        onOpenChange(false);
        queueMicrotask(() => triggerRef.current?.focus());
    };

    const selectTheme = (themeKey: string) => {
        onThemeChange(themeKey);
        closeAndRestoreFocus();
    };

    const menu = (
        <ul
            id={menuId}
            aria-label={t('plugins.mindmap.toolbar.chooseTheme')}
            className="mind-map-theme-menu"
            role="menu"
            style={{
                background: token.colorBgElevated,
                borderColor: token.colorBorderSecondary,
                boxShadow: token.boxShadowSecondary,
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    closeAndRestoreFocus();
                    return;
                }
                const focusedIndex = itemRefs.current.findIndex(item => item === document.activeElement);
                const nextIndex = getNextThemeIndex(event.key, Math.max(0, focusedIndex), VIZLY_THEME_OPTIONS.length);
                if (nextIndex === null) return;
                event.preventDefault();
                itemRefs.current[nextIndex]?.focus();
            }}
        >
            {VIZLY_THEME_OPTIONS.map((option, index) => {
                const selected = option.key === activeThemeKey;
                return (
                    <li key={option.key} role="none">
                        <button
                            ref={element => { itemRefs.current[index] = element; }}
                            aria-checked={selected}
                            className={`mind-map-theme-menu-item${selected ? ' is-selected' : ''}`}
                            role="menuitemradio"
                            tabIndex={selected ? 0 : -1}
                            type="button"
                            onClick={() => selectTheme(option.key)}
                        >
                            <span
                                aria-hidden="true"
                                className="mind-map-theme-menu-swatch"
                                style={{ background: option.theme.cssVar['--main-bgcolor'] }}
                            />
                            <span className="mind-map-theme-menu-label">
                                {t(`plugins.mindmap.toolbar.themeNames.${option.key}`)}
                            </span>
                            {selected && <CheckOutlined aria-hidden="true" className="mind-map-theme-menu-check" />}
                        </button>
                    </li>
                );
            })}
        </ul>
    );

    return (
        <Tooltip title={t('plugins.mindmap.toolbar.currentTheme', { theme: activeLabel })} open={open || suppressTooltip ? false : undefined}>
            <Dropdown
                autoAdjustOverflow
                popupRender={() => menu}
                getPopupContainer={getViewportPopupContainer}
                menu={{ items: [] }}
                open={open}
                placement="bottomRight"
                trigger={['click']}
                onOpenChange={onOpenChange}
            >
                <Button
                    ref={triggerRef}
                    aria-controls={menuId}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    aria-label={t('plugins.mindmap.toolbar.currentTheme', { theme: activeLabel })}
                    className="mind-elixir-toolbar-button"
                    icon={<BgColorsOutlined />}
                    size="small"
                    style={{ color: VIZLY_THEMES[activeThemeKey]?.palette[0] ?? '#6366f1' }}
                    type="text"
                    onKeyDown={(event) => {
                        if (!['ArrowDown', 'Enter', ' '].includes(event.key)) return;
                        event.preventDefault();
                        onOpenChange(true);
                    }}
                />
            </Dropdown>
        </Tooltip>
    );
};
