import type { Topic } from 'mind-elixir';

import { toSafeExternalUrl } from '../../utils/sanitizeHtml';

const MAX_ACCESSIBLE_TOPIC_LENGTH = 80;

type FormatHyperlinkLabel = (topic: string) => string;

interface MindMapHyperlinkNode {
    id: string;
    topic?: unknown;
    hyperLink?: unknown;
}

export const coerceMindMapHyperlinkTopic = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    return normalized.slice(0, MAX_ACCESSIBLE_TOPIC_LENGTH);
};

export const enhanceMindMapTopicHyperlink = (
    topicElement: Topic,
    node: MindMapHyperlinkNode,
    formatLabel: FormatHyperlinkLabel,
    fallbackTopic: string,
): void => {
    const link = topicElement.querySelector<HTMLAnchorElement>('a.hyper-link');
    if (!link) return;

    const safeUrl = typeof node.hyperLink === 'string'
        ? toSafeExternalUrl(node.hyperLink)
        : null;
    if (!safeUrl) {
        link.remove();
        return;
    }

    const topic = coerceMindMapHyperlinkTopic(node.topic, fallbackTopic);
    const label = formatLabel(topic);
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', label);
    link.title = label;
};

const getMindMapTopicNode = (element: Element): MindMapHyperlinkNode | null => {
    const candidate = (element as { nodeObj?: unknown }).nodeObj;
    if (typeof candidate !== 'object' || candidate === null) return null;
    if (!('id' in candidate) || typeof candidate.id !== 'string') return null;
    return {
        id: candidate.id,
        topic: 'topic' in candidate ? candidate.topic : undefined,
        hyperLink: 'hyperLink' in candidate ? candidate.hyperLink : undefined,
    };
};

export const syncMindMapHyperlinkAccessibility = (
    root: HTMLElement,
    formatLabel: FormatHyperlinkLabel,
    fallbackTopic: string,
): void => {
    root.querySelectorAll('me-tpc').forEach(element => {
        const node = getMindMapTopicNode(element);
        if (!node) return;
        enhanceMindMapTopicHyperlink(element as Topic, node, formatLabel, fallbackTopic);
    });
};

export const bindMindMapHyperlinkAccessibility = (
    root: HTMLElement,
    formatLabel: FormatHyperlinkLabel,
    fallbackTopic: string,
): (() => void) => {
    const sync = () => syncMindMapHyperlinkAccessibility(root, formatLabel, fallbackTopic);
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
        observer.disconnect();
    };
};
