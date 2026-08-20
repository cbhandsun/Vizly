import type { TFunction } from 'i18next';

import type { TemplateNode } from './mindmapTemplateModel';

export type MindMapTemplateKey =
    | 'swot'
    | 'meeting'
    | 'project'
    | 'reading'
    | 'problem'
    | 'brainstorm';

export interface MindMapTemplate {
    key: MindMapTemplateKey;
    label: string;
    description: string;
    mode: 'replace' | 'insert';
    tree: TemplateNode;
}

interface TemplateTranslationNode {
    topicKey: string;
    children?: TemplateTranslationNode[];
}

interface TemplateDefinition {
    key: MindMapTemplateKey;
    mode: MindMapTemplate['mode'];
    tree: TemplateTranslationNode;
}

const node = (
    topicKey: string,
    children?: TemplateTranslationNode[],
): TemplateTranslationNode => ({ topicKey, children });

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
    {
        key: 'swot',
        mode: 'replace',
        tree: node('root', [
            node('strengths', [node('strength1'), node('strength2')]),
            node('weaknesses', [node('weakness1'), node('weakness2')]),
            node('opportunities', [node('opportunity1'), node('opportunity2')]),
            node('threats', [node('threat1'), node('threat2')]),
        ]),
    },
    {
        key: 'meeting',
        mode: 'replace',
        tree: node('root', [
            node('details', [node('date'), node('attendees'), node('facilitator')]),
            node('agenda', [node('agenda1'), node('agenda2')]),
            node('decisions', [node('decision1'), node('decision2')]),
            node('actions', [node('actionFormat')]),
            node('followUp', [node('nextAgenda')]),
        ]),
    },
    {
        key: 'project',
        mode: 'replace',
        tree: node('root', [
            node('goals', [node('primaryGoal'), node('successMetrics')]),
            node('milestones', [node('phase1'), node('phase2'), node('phase3')]),
            node('risks', [node('risk1'), node('risk2')]),
            node('resources', [node('people'), node('budget'), node('tools')]),
            node('tracking', [node('completedThisWeek'), node('nextWeek')]),
        ]),
    },
    {
        key: 'reading',
        mode: 'replace',
        tree: node('root', [
            node('bookDetails', [node('bookTitle'), node('author'), node('rating')]),
            node('keyIdeas', [node('idea1'), node('idea2'), node('idea3')]),
            node('quotes', [node('quote1'), node('quote2')]),
            node('reflections', [node('reflection')]),
            node('application', [node('practice')]),
        ]),
    },
    {
        key: 'problem',
        mode: 'replace',
        tree: node('root', [
            node('what', [node('symptoms')]),
            node('why', [node('cause1'), node('cause2'), node('cause3')]),
            node('where', [node('scope')]),
            node('when', [node('timeline')]),
            node('who', [node('stakeholders')]),
            node('how', [node('solution1'), node('solution2')]),
        ]),
    },
    {
        key: 'brainstorm',
        mode: 'insert',
        tree: node('root', [
            node('ideaA', [node('detailA1'), node('detailA2')]),
            node('ideaB', [node('detailB1'), node('detailB2')]),
            node('ideaC', [node('detailC1')]),
            node('ideaD'),
        ]),
    },
];

const localizeTree = (
    templateKey: MindMapTemplateKey,
    value: TemplateTranslationNode,
    t: TFunction,
): TemplateNode => ({
    topic: t(`plugins.mindmap.templates.catalog.${templateKey}.topics.${value.topicKey}`),
    children: value.children?.map(child => localizeTree(templateKey, child, t)),
});

export const buildLocalizedMindMapTemplates = (t: TFunction): MindMapTemplate[] => (
    TEMPLATE_DEFINITIONS.map(definition => ({
        key: definition.key,
        mode: definition.mode,
        label: t(`plugins.mindmap.templates.catalog.${definition.key}.label`),
        description: t(`plugins.mindmap.templates.catalog.${definition.key}.description`),
        tree: localizeTree(definition.key, definition.tree, t),
    }))
);
