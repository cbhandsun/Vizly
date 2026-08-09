// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import DocsPreview from '../DocsPreview';

describe('DocsPreview', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh');
    });

    it('renders a recoverable, semantic help experience', () => {
        const { container } = render(<DocsPreview />);

        expect(container.firstElementChild?.getAttribute('data-smoke-ready')).toBe('docs-preview');
        expect(screen.getByRole('link', { name: '返回工作台' }).getAttribute('href')).toBe('#/manage');
        expect(screen.getByRole('navigation', { name: '帮助主题' })).toBeTruthy();
        expect(screen.getByRole('main', { name: '帮助正文' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: '从想法到清晰图表', level: 1 })).toBeTruthy();
        expect(screen.getAllByRole('button')).toHaveLength(6);
    });

    it('filters topics, announces results, and recovers from an empty search', () => {
        render(<DocsPreview />);
        const search = screen.getByRole('searchbox', { name: '搜索帮助主题' });

        fireEvent.change(search, { target: { value: '分享' } });
        expect(screen.getByRole('status').textContent).toBe('找到 1 个帮助主题');
        expect(screen.getByRole('button', { name: /分享与只读查看/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /快速开始/ })).toBeNull();

        fireEvent.change(search, { target: { value: '不存在的内容' } });
        expect(screen.getByRole('heading', { name: '没有匹配的帮助主题' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '清除搜索' }));
        expect(screen.getByRole('heading', { name: '快速开始', level: 2 })).toBeTruthy();
    });

    it('switches the article from the topic navigation', () => {
        render(<DocsPreview />);

        fireEvent.click(screen.getByRole('button', { name: /存储与同步/ }));
        expect(screen.getByRole('heading', { name: '存储与同步', level: 2 })).toBeTruthy();
        expect(screen.getByRole('button', { name: /存储与同步/ }).getAttribute('aria-current')).toBe('page');
    });
});
