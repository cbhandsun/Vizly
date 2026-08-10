import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ShareViewPage from '../ShareViewPage';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';

const getSharedDiagramMock = vi.fn();
const registerDiagramMock = vi.fn();
const SHARE_RECORD_ID = '44444444-4444-4444-8444-444444444444';
const LOCAL_SHARED_DIAGRAM_ID = `shared-record-${SHARE_RECORD_ID}`;
const registerRemoteDiagramMock = vi.fn((content: unknown, fallback: { id: string; title: string }) => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Error('Remote diagram is invalid');
    }
    const record = content as Record<string, unknown>;
    if (!Array.isArray(record.nodes)) throw new Error('Remote diagram is invalid');
    const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
        ? record.metadata as Record<string, unknown>
        : undefined;
    return {
        ...record,
        id: fallback.id,
        name: typeof record.name === 'string'
            ? record.name
            : typeof metadata?.title === 'string'
                ? metadata.title
                : fallback.title,
        nodes: record.nodes,
        edges: Array.isArray(record.edges) ? record.edges : [],
        type: typeof record.type === 'string' ? record.type : 'custom',
        version: typeof record.version === 'string' ? record.version : '1.0.0',
        layout: record.layout && typeof record.layout === 'object' ? record.layout : {},
        theme: record.theme && typeof record.theme === 'object' ? record.theme : {},
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('antd', () => ({
    Spin: () => <div data-testid="spin" />,
    Button: React.forwardRef<HTMLAnchorElement | HTMLButtonElement, {
        children?: React.ReactNode;
        href?: string;
        onClick?: () => void;
    }>(({ children, href, onClick }, ref) => href ? (
        <a ref={ref as React.Ref<HTMLAnchorElement>} href={href}>{children}</a>
    ) : (
        <button ref={ref as React.Ref<HTMLButtonElement>} type="button" onClick={onClick}>{children}</button>
    )),
    Result: ({
        title,
        subTitle,
        extra,
    }: {
        title: React.ReactNode;
        subTitle?: React.ReactNode;
        extra?: React.ReactNode;
    }) => (
        <div>
            <h1>{title}</h1>
            {subTitle && <p>{subTitle}</p>}
            {extra}
        </div>
    ),
    Tag: ({
        children,
        className,
    }: {
        children?: React.ReactNode;
        className?: string;
    }) => <span className={className}>{children}</span>,
    Typography: {
        Text: ({
            children,
            className,
            title,
        }: {
            children: React.ReactNode;
            className?: string;
            title?: string;
        }) => <span className={className} title={title}>{children}</span>,
    },
}));

vi.mock('@/services/ShareService', () => ({
    shareService: {
        getSharedDiagram: getSharedDiagramMock,
    },
}));

vi.mock('@/services/DataService', () => ({
    dataService: {
        registerDiagram: registerDiagramMock,
        registerRemoteDiagram: registerRemoteDiagramMock,
    },
}));

vi.mock('@xyflow/react', () => ({
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="react-flow-provider">{children}</div>
    ),
}));

vi.mock('@/core/components/diagrams/FlowchartDesigner', () => ({
    default: ({ id, isReadonly }: { id: string; isReadonly?: boolean }) => (
        <div data-testid="flowchart-designer" data-id={id} data-readonly={String(isReadonly)} />
    ),
}));

const renderSharePage = (initialEntry: string) => render(
    <MemoryRouter initialEntries={[initialEntry]}>
        <ShareViewPage />
    </MemoryRouter>
);

describe('ShareViewPage', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        getSharedDiagramMock.mockReset();
        registerDiagramMock.mockReset();
        registerRemoteDiagramMock.mockClear();
    });

    it('shows a 404 without importing remote share data when token is missing', async () => {
        renderSharePage('/shared');

        expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
        expect(screen.getByRole('banner')).toHaveTextContent('Vizly');
        expect(screen.getByText('share.notFound')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'share.backToWorkspace' })).toHaveAttribute('href', '#/manage');

        await waitFor(() => {
            expect(getSharedDiagramMock).not.toHaveBeenCalled();
            expect(registerDiagramMock).not.toHaveBeenCalled();
        });
    });

    it('rejects malformed tokens before loading remote share data', async () => {
        renderSharePage('/shared?token=short');

        expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();

        await waitFor(() => {
            expect(getSharedDiagramMock).not.toHaveBeenCalled();
            expect(registerDiagramMock).not.toHaveBeenCalled();
        });
    });

    it('loads and registers the shared diagram for a valid token', async () => {
        const token = 'abcdefghijklmnop';
        const content = {
            id: 'original-id',
            name: 'Shared Flow',
            nodes: [],
            edges: [],
        };
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: SHARE_RECORD_ID },
            diagram: {
                title: 'Fallback title',
                content,
            },
        });

        renderSharePage(`/shared?token=${token}`);

        expect(screen.getByTestId('spin')).toBeInTheDocument();

        await screen.findByText('Shared Flow');
        expect(getSharedDiagramMock).toHaveBeenCalledWith(token, expect.any(AbortSignal));
        expect(registerRemoteDiagramMock).toHaveBeenCalledWith({
            ...content,
            id: LOCAL_SHARED_DIAGRAM_ID,
        }, {
            id: LOCAL_SHARED_DIAGRAM_ID,
            title: 'Fallback title',
        });
        expect(registerDiagramMock).not.toHaveBeenCalled();
        expect(await screen.findByTestId('flowchart-designer')).toHaveAttribute('data-id', LOCAL_SHARED_DIAGRAM_ID);
        expect(screen.getAllByTestId('flowchart-designer')).toHaveLength(1);
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByText('share.viewOnly')).toBeInTheDocument();
        expect(screen.getByText('share.poweredBy')).toBeInTheDocument();
        expect(screen.getByRole('main', { name: 'share.viewerLabel' })).toBeInTheDocument();
    });

    it('loads direct-path share links that put token in the browser search string', async () => {
        const token = 'directsharetoken1';
        const content = {
            id: 'original-id',
            name: 'Direct Shared Flow',
            nodes: [],
            edges: [],
        };
        window.history.replaceState({}, '', `/shared?token=${token}`);
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: SHARE_RECORD_ID },
            diagram: {
                title: 'Direct fallback title',
                content,
            },
        });

        renderSharePage('/shared');

        await screen.findByText('Direct Shared Flow');
        expect(getSharedDiagramMock).toHaveBeenCalledWith(token, expect.any(AbortSignal));
        expect(registerRemoteDiagramMock).toHaveBeenCalledWith({
            ...content,
            id: LOCAL_SHARED_DIAGRAM_ID,
        }, {
            id: LOCAL_SHARED_DIAGRAM_ID,
            title: 'Direct fallback title',
        });
        expect(await screen.findByTestId('flowchart-designer')).toHaveAttribute('data-id', LOCAL_SHARED_DIAGRAM_ID);
    });

    it('routes unsafe shared content through the remote registration guard', async () => {
        const token = 'abcdefghijklmnop';
        const unsafeContent = {
            id: 'remote-id',
            name: 'Unsafe Flow',
            type: 'flowchart',
            version: '1.0.0',
            nodes: [{
                id: 'node-1',
                description: 'Start',
                domain: 'default',
                constructor: { polluted: true },
            }],
            edges: [],
            metadata: {
                title: 'Unsafe Flow',
                constructor: { polluted: true },
            },
            layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 100, vertical: 80 }, padding: { horizontal: 20, vertical: 20 } },
            theme: { name: 'light', displayName: 'Light', domains: {} },
        };
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: SHARE_RECORD_ID },
            diagram: {
                title: 'Unsafe shared diagram',
                content: unsafeContent,
            },
        });

        renderSharePage(`/shared?token=${token}`);

        await screen.findByText('Unsafe Flow');
        expect(registerRemoteDiagramMock).toHaveBeenCalledWith({
            ...unsafeContent,
            id: LOCAL_SHARED_DIAGRAM_ID,
        }, {
            id: LOCAL_SHARED_DIAGRAM_ID,
            title: 'Unsafe shared diagram',
        });
        expect(registerDiagramMock).not.toHaveBeenCalled();
    });

    it('shows a recoverable service state when shared content cannot be registered', async () => {
        const token = 'abcdefghijklmnop';
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: SHARE_RECORD_ID },
            diagram: {
                title: 'Bad shared diagram',
                content: {
                    id: 'bad-id',
                    name: 'Bad Flow',
                    nodes: 'not-an-array',
                    edges: [],
                },
            },
        });

        renderSharePage(`/shared?token=${token}`);

        expect(await screen.findByRole('heading', { name: 'share.viewerUnavailable' })).toBeInTheDocument();
        expect(screen.getByRole('banner')).toHaveTextContent('Vizly');
        expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument();
        expect(registerDiagramMock).not.toHaveBeenCalled();
    });

    it('shows a recoverable service state when the shared record has no diagram content', async () => {
        const token = 'abcdefghijklmnop';
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: SHARE_RECORD_ID },
            diagram: {
                title: 'Empty shared diagram',
                content: null,
            },
        });

        renderSharePage(`/shared?token=${token}`);

        expect(await screen.findByRole('heading', { name: 'share.viewerUnavailable' })).toBeInTheDocument();
        expect(getSharedDiagramMock).toHaveBeenCalledWith(token, expect.any(AbortSignal));
        expect(registerDiagramMock).not.toHaveBeenCalled();
    });

    it('keeps service failures distinct from expired links and retries in place', async () => {
        const token = 'retrysharetoken1';
        getSharedDiagramMock
            .mockRejectedValueOnce(new Error('Authorization: Bearer private-share-secret'))
            .mockResolvedValueOnce({
                share: { id: SHARE_RECORD_ID },
                diagram: {
                    title: 'Recovered title',
                    content: {
                        id: 'remote-id',
                        name: 'Recovered shared flow',
                        nodes: [],
                        edges: [],
                    },
                },
            });

        renderSharePage(`/shared?token=${token}`);

        expect(await screen.findByRole('heading', { name: 'share.viewerUnavailable' })).toBeInTheDocument();
        expect(screen.queryByText(/private-share-secret/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: '404' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));

        expect(await screen.findByText('Recovered shared flow')).toBeInTheDocument();
        expect(getSharedDiagramMock).toHaveBeenCalledTimes(2);
    });

    it('announces retry failures and restores focus to the retry action', async () => {
        const token = 'retryfailuretoken';
        getSharedDiagramMock.mockRejectedValue(new Error('Service unavailable'));

        renderSharePage(`/shared?token=${token}`);

        const initialRetry = await screen.findByRole('button', { name: 'common.retry' });
        expect(screen.getByRole('alert')).toHaveTextContent('share.viewerUnavailable');

        fireEvent.click(initialRetry);

        expect(await screen.findByRole('heading', { name: 'share.viewerUnavailable' })).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'common.retry' })).toHaveFocus();
        });
        expect(screen.getByRole('alert')).toHaveAttribute('aria-atomic', 'true');
        expect(getSharedDiagramMock).toHaveBeenCalledTimes(2);
    });

    it('bounds and normalizes the public title before rendering it in the header', async () => {
        const token = 'boundedsharetoken';
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: SHARE_RECORD_ID },
            diagram: {
                title: 'Fallback title',
                content: {
                    id: 'remote-id',
                    name: `  ${'x'.repeat(500)}\nsecret  `,
                    nodes: [],
                    edges: [],
                },
            },
        });

        renderSharePage(`/shared?token=${token}`);

        const title = await screen.findByTitle('x'.repeat(240));
        expect(title).toHaveTextContent('x'.repeat(240));
        expect(title.textContent).not.toContain('secret');
    });

    it('ships public-view branding and read-only labels in both supported locales', () => {
        expect(en.share).toMatchObject({
            poweredBy: 'Created with Vizly',
            viewOnly: 'View only',
        });
        expect(zh.share).toMatchObject({
            poweredBy: '由 Vizly 创建',
            viewOnly: '仅查看',
        });
    });
});
