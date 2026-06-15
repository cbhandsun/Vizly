import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ShareViewPage from '../ShareViewPage';

const getSharedDiagramMock = vi.fn();
const registerDiagramMock = vi.fn();
const registerRemoteDiagramMock = vi.fn((content: any, fallback: { id: string; title: string }) => {
    if (!content || typeof content !== 'object' || !Array.isArray(content.nodes)) {
        throw new Error('Remote diagram is invalid');
    }
    return {
        ...content,
        id: fallback.id,
        name: content?.name || content?.metadata?.title || fallback.title,
        nodes: content.nodes,
        edges: Array.isArray(content?.edges) ? content.edges : [],
        type: content?.type || 'custom',
        version: content?.version || '1.0.0',
        layout: content?.layout || {},
        theme: content?.theme || {},
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('antd', () => ({
    Spin: () => <div data-testid="spin" />,
    Result: ({ title, subTitle }: { title: string; subTitle?: string }) => (
        <div>
            <h1>{title}</h1>
            {subTitle && <p>{subTitle}</p>}
        </div>
    ),
    Typography: {
        Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    },
    theme: {
        useToken: () => ({
            token: {
                colorBgLayout: '#f5f5f5',
                colorBgContainer: '#ffffff',
                colorBorderSecondary: '#eeeeee',
            },
        }),
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
        getSharedDiagramMock.mockReset();
        registerDiagramMock.mockReset();
        registerRemoteDiagramMock.mockClear();
    });

    it('shows a 404 without importing remote share data when token is missing', async () => {
        renderSharePage('/shared');

        expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
        expect(screen.getByText('share.notFound')).toBeInTheDocument();

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
            share: { id: 'share-id' },
            diagram: {
                title: 'Fallback title',
                content,
            },
        });

        renderSharePage(`/shared?token=${token}`);

        expect(screen.getByTestId('spin')).toBeInTheDocument();

        await screen.findByText('Shared Flow');
        expect(getSharedDiagramMock).toHaveBeenCalledWith(token);
        expect(registerRemoteDiagramMock).toHaveBeenCalledWith({
            ...content,
            id: `shared-${token}`,
        }, {
            id: `shared-${token}`,
            title: 'Fallback title',
        });
        expect(registerDiagramMock).not.toHaveBeenCalled();
        expect(await screen.findByTestId('flowchart-designer')).toHaveAttribute('data-id', `shared-${token}`);
        expect(screen.getAllByTestId('flowchart-designer')).toHaveLength(1);
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
            share: { id: 'share-id' },
            diagram: {
                title: 'Unsafe shared diagram',
                content: unsafeContent,
            },
        });

        renderSharePage(`/shared?token=${token}`);

        await screen.findByText('Unsafe Flow');
        expect(registerRemoteDiagramMock).toHaveBeenCalledWith({
            ...unsafeContent,
            id: `shared-${token}`,
        }, {
            id: `shared-${token}`,
            title: 'Unsafe shared diagram',
        });
        expect(registerDiagramMock).not.toHaveBeenCalled();
    });

    it('shows an error when mocked shared content has an invalid shape', async () => {
        const token = 'abcdefghijklmnop';
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: 'share-id' },
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

        expect(await screen.findByRole('heading', { name: '404' })).toBeInTheDocument();
        expect(registerDiagramMock).not.toHaveBeenCalled();
    });

    it('shows an error when the shared record has no diagram content', async () => {
        const token = 'abcdefghijklmnop';
        getSharedDiagramMock.mockResolvedValueOnce({
            share: { id: 'share-id' },
            diagram: {
                title: 'Empty shared diagram',
                content: null,
            },
        });

        renderSharePage(`/shared?token=${token}`);

        expect(await screen.findByRole('heading', { name: '404' })).toBeInTheDocument();
        expect(getSharedDiagramMock).toHaveBeenCalledWith(token);
        expect(registerDiagramMock).not.toHaveBeenCalled();
    });
});
