import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import type { NodeObj, Topic } from 'mind-elixir';

import {
    assignMindMapAuthoredTopic,
    bindMindMapGeneratedTopicAuthorship,
    applyGeneratedTopicLocaleToMindMap,
    MINDMAP_GENERATED_TOPIC_FIELD,
    MINDMAP_GENERATED_TOPIC_KEYS,
    relocalizeGeneratedMindMapTopics,
    type MindMapTopicEditor,
} from '../mindMapGeneratedTopicLocalization';
import { cleanMindMapChildNode } from '../mindmapBridgeSecurity';
import { cleanAndValidateTree } from '../mindmapTreeSanitizer';

describe('generated mind-map topic localization', () => {
    let originalLanguage: string;

    beforeAll(() => {
        originalLanguage = i18n.resolvedLanguage || i18n.language || 'en';
    });

    afterAll(async () => {
        await i18n.changeLanguage(originalLanguage);
    });

    it('marks missing imported topics and relocalizes only those generated values', async () => {
        await i18n.changeLanguage('en');
        const root = cleanAndValidateTree({
            id: 'root',
            topic: 'Planning',
            children: [
                { id: 'generated', children: [] },
                { id: 'authored', topic: 'Untitled node', children: [] },
            ],
        }, true);

        expect(root.children?.[0]).toMatchObject({
            topic: 'Untitled node',
            [MINDMAP_GENERATED_TOPIC_FIELD]: MINDMAP_GENERATED_TOPIC_KEYS.untitled,
        });
        expect(root.children?.[1]).toMatchObject({ topic: 'Untitled node' });
        expect(root.children?.[1]).not.toHaveProperty(MINDMAP_GENERATED_TOPIC_FIELD);

        await i18n.changeLanguage('zh');
        const localized = relocalizeGeneratedMindMapTopics(root);
        expect(localized.changed).toBe(true);
        expect(localized.nodeData.children?.[0]?.topic).toBe('未命名节点');
        expect(localized.nodeData.children?.[1]?.topic).toBe('Untitled node');
    });

    it('marks default new-node labels but preserves explicit labels', async () => {
        await i18n.changeLanguage('zh');

        expect(cleanMindMapChildNode({}, 'generated')).toMatchObject({
            topic: '新节点',
            [MINDMAP_GENERATED_TOPIC_FIELD]: MINDMAP_GENERATED_TOPIC_KEYS.newNode,
        });
        expect(cleanMindMapChildNode({ label: '新节点' }, 'authored')).not.toHaveProperty(
            MINDMAP_GENERATED_TOPIC_FIELD,
        );
    });

    it('stops automatic relocalization after the user edits a generated topic', async () => {
        await i18n.changeLanguage('en');
        const generated = cleanMindMapChildNode({}, 'generated');
        assignMindMapAuthoredTopic(generated, 'My topic');

        await i18n.changeLanguage('zh');
        const localized = relocalizeGeneratedMindMapTopics(generated);
        expect(localized).toEqual({ nodeData: generated, changed: false });
        expect(localized.nodeData.topic).toBe('My topic');
    });

    it('treats setNodeTopic as authored content and restores the original setter', async () => {
        await i18n.changeLanguage('en');
        const generated = cleanMindMapChildNode({}, 'generated');
        const originalSetNodeTopic = vi.fn();
        const mind: MindMapTopicEditor = {
            setNodeTopic: originalSetNodeTopic,
        };
        const topic = { nodeObj: generated } as Topic;
        const unbind = bindMindMapGeneratedTopicAuthorship(mind);

        mind.setNodeTopic(topic, 'My topic');
        expect(originalSetNodeTopic).toHaveBeenCalledWith(topic, 'My topic');
        expect(generated).not.toHaveProperty(MINDMAP_GENERATED_TOPIC_FIELD);

        unbind();
        expect(mind.setNodeTopic).toBe(originalSetNodeTopic);
    });

    it('ignores invalid marker values from external data', async () => {
        await i18n.changeLanguage('zh');
        const unsafe = {
            id: 'unsafe',
            topic: 'Keep me',
            children: [],
            [MINDMAP_GENERATED_TOPIC_FIELD]: 'plugins.mindmap.templates.catalog.secret',
        } as NodeObj;

        const clean = cleanAndValidateTree(unsafe);
        expect(clean.topic).toBe('Keep me');
        expect(clean).not.toHaveProperty(MINDMAP_GENERATED_TOPIC_FIELD);
    });

    it('restores the active selection after refreshing localized generated topics', async () => {
        await i18n.changeLanguage('en');
        const root = cleanAndValidateTree({
            id: 'root',
            topic: 'Planning',
            children: [{ id: 'generated', children: [] }],
        }, true);
        await i18n.changeLanguage('zh');
        const selectedTopic = { nodeObj: root.children?.[0] } as Topic;
        const refresh = vi.fn();
        const selectTopics = vi.fn();

        const changed = applyGeneratedTopicLocaleToMindMap({
            data: { nodeData: root, direction: 2 },
            selectedNodeIds: ['generated', 'missing'],
            refresh,
            findTopic: nodeId => nodeId === 'generated' ? selectedTopic : null,
            selectTopics,
        });

        expect(changed).toBe(true);
        expect(refresh).toHaveBeenCalledWith(expect.objectContaining({
            nodeData: expect.objectContaining({
                children: [expect.objectContaining({ topic: '未命名节点' })],
            }),
        }));
        expect(selectTopics).toHaveBeenCalledWith([selectedTopic]);
    });
});
