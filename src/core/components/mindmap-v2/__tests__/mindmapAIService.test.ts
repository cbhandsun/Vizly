import { describe, expect, it } from 'vitest';
import { parseTaskClassifications } from '../mindmapTaskAIParsing';

describe('parseTaskClassifications', () => {
    it('parses fenced JSON arrays', () => {
        expect(parseTaskClassifications('```json\n[{"id":"a","status":"doing","priority":"高"}]\n```')).toEqual([
            { id: 'a', status: 'doing', priority: '高' },
        ]);
    });

    it('extracts JSON arrays from surrounding prose', () => {
        const content = '可以，结果如下：\n[{"id":"b","status":"done","priority":"低"}]\n请确认。';

        expect(parseTaskClassifications(content)).toEqual([
            { id: 'b', status: 'done', priority: '低' },
        ]);
    });

    it('drops unusable rows and defaults invalid enum values', () => {
        const content = JSON.stringify([
            { id: ' c ', status: 'blocked', priority: '紧急' },
            { id: '', status: 'doing', priority: '高' },
            { status: 'done', priority: '低' },
        ]);

        expect(parseTaskClassifications(content)).toEqual([
            { id: 'c', status: 'todo', priority: '中' },
        ]);
    });
});
