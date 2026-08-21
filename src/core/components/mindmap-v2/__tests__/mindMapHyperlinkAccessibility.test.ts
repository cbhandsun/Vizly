import { describe, expect, it, vi } from 'vitest';
import type { NodeObj, Topic } from 'mind-elixir';

import {
    bindMindMapHyperlinkAccessibility,
    coerceMindMapHyperlinkTopic,
    enhanceMindMapTopicHyperlink,
    syncMindMapHyperlinkAccessibility,
} from '../mindMapHyperlinkAccessibility';

const createTopicElement = (href = 'https://example.com/docs'): Topic => {
    const topic = document.createElement('me-tpc') as Topic;
    const link = document.createElement('a');
    link.className = 'hyper-link';
    link.href = href;
    link.target = '_blank';
    link.textContent = '🔗';
    topic.appendChild(link);
    return topic;
};

describe('mind map hyperlink accessibility', () => {
    it('normalizes and bounds untrusted node topics', () => {
        expect(coerceMindMapHyperlinkTopic('  Quarterly\n  plan  ', 'Untitled node'))
            .toBe('Quarterly plan');
        expect(coerceMindMapHyperlinkTopic('', 'Untitled node')).toBe('Untitled node');
        expect(coerceMindMapHyperlinkTopic(null, 'Untitled node')).toBe('Untitled node');
        expect(coerceMindMapHyperlinkTopic('x'.repeat(200), 'Untitled node')).toHaveLength(80);
    });

    it('names safe links, explains the new tab, and adds explicit opener protection', () => {
        const topic = createTopicElement();
        enhanceMindMapTopicHyperlink(
            topic,
            { id: 'node-1', topic: 'Quarterly plan', hyperLink: 'example.com/docs' } as NodeObj,
            nodeTopic => `Open the link for ${nodeTopic} in a new tab`,
            'Untitled node',
        );

        const link = topic.querySelector('a');
        expect(link?.href).toBe('https://example.com/docs');
        expect(link?.target).toBe('_blank');
        expect(link?.rel).toBe('noopener noreferrer');
        expect(link?.getAttribute('aria-label')).toBe('Open the link for Quarterly plan in a new tab');
        expect(link?.title).toBe('Open the link for Quarterly plan in a new tab');
    });

    it('removes vendor anchors when the node link is unsafe', () => {
        const topic = createTopicElement('javascript:alert(1)');
        enhanceMindMapTopicHyperlink(
            topic,
            { id: 'node-1', topic: 'Unsafe', hyperLink: 'javascript:alert(1)' } as NodeObj,
            nodeTopic => nodeTopic,
            'Untitled node',
        );

        expect(topic.querySelector('a.hyper-link')).toBeNull();
    });

    it('uses the fallback topic when vendor metadata has a non-string topic', () => {
        const topic = createTopicElement();
        enhanceMindMapTopicHyperlink(
            topic,
            { id: 'node-1', topic: null, hyperLink: 'https://example.com/docs' },
            nodeTopic => `Open ${nodeTopic} in a new tab`,
            'Untitled node',
        );

        expect(topic.querySelector('a')?.getAttribute('aria-label'))
            .toBe('Open Untitled node in a new tab');
    });

    it('leaves topics without a hyperlink anchor unchanged', () => {
        const topic = document.createElement('me-tpc') as Topic;
        enhanceMindMapTopicHyperlink(
            topic,
            { id: 'node-1', topic: 'No link' } as NodeObj,
            nodeTopic => nodeTopic,
            'Untitled node',
        );
        expect(topic.childElementCount).toBe(0);
    });

    it('decorates initial and dynamically rendered vendor topics', async () => {
        const root = document.createElement('div');
        const initialTopic = createTopicElement();
        initialTopic.nodeObj = {
            id: 'node-1',
            topic: 'Release notes',
            hyperLink: 'https://example.com/release',
        } as NodeObj;
        root.appendChild(initialTopic);

        const cleanup = bindMindMapHyperlinkAccessibility(
            root,
            topic => `Open ${topic} in a new tab`,
            'Untitled node',
        );
        expect(initialTopic.querySelector('a')?.getAttribute('aria-label'))
            .toBe('Open Release notes in a new tab');

        const addedTopic = createTopicElement('https://example.com/roadmap');
        addedTopic.nodeObj = {
            id: 'node-2',
            topic: 'Roadmap',
            hyperLink: 'https://example.com/roadmap',
        } as NodeObj;
        root.appendChild(addedTopic);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(addedTopic.querySelector('a')?.getAttribute('aria-label'))
            .toBe('Open Roadmap in a new tab');

        cleanup();
        cleanup();
    });

    it('ignores malformed vendor topic metadata', () => {
        const root = document.createElement('div');
        const topic = createTopicElement();
        topic.nodeObj = null as unknown as NodeObj;
        root.appendChild(topic);

        expect(() => syncMindMapHyperlinkAccessibility(root, vi.fn(), 'Untitled node'))
            .not.toThrow();
        expect(topic.querySelector('a')?.getAttribute('aria-label')).toBeNull();
    });
});
