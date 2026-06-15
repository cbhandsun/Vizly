import { describe, expect, it } from 'vitest';
import {
    AI_COMMAND_MAX_COMMANDS,
    AI_COMMAND_MAX_JSON_CHARS,
    AI_COMMAND_SCAN_MAX_CHARS,
    extractValidatedAICommands,
    sanitizeValidatedAICommand,
} from '../aiCommandExtraction';

describe('aiCommandExtraction', () => {
    it('extracts valid commands and strips non-whitelisted fields', () => {
        const result = extractValidatedAICommands(`
            text
            [COMMAND: {"action":"addNode","label":"API","shape":"rectangle","extra":"drop-me"}]
            [COMMAND: {"action":"connectNodes","source":"a","target":"b","label":"calls","debug":{"x":1}}]
        `);

        expect(result.rejected).toEqual([]);
        expect(result.commands).toEqual([
            { action: 'addNode', label: 'API', shape: 'rectangle' },
            { action: 'connectNodes', source: 'a', target: 'b', label: 'calls' },
        ]);
    });

    it('rejects invalid JSON, high-risk actions and oversized command payloads', () => {
        const result = extractValidatedAICommands(`
            [COMMAND: {"action":"save"}]
            [COMMAND: {"action":"addNode",}]
            [COMMAND: {"action":"addNode","label":"${'x'.repeat(AI_COMMAND_MAX_JSON_CHARS)}"}]
            [COMMAND: {"action":"layout","strategy":"dagre"}]
        `);

        expect(result.commands).toEqual([{ action: 'layout', strategy: 'dagre' }]);
        expect(result.rejected.map(item => item.reason)).toEqual([
            'save requires explicit user action',
            'invalid command JSON',
            'command JSON too large',
        ]);
    });

    it('limits command count and scan length', () => {
        const commands = Array.from({ length: AI_COMMAND_MAX_COMMANDS + 2 }, (_, index) =>
            `[COMMAND: {"action":"layout","strategy":"s${index}"}]`
        ).join('\n');
        const limited = extractValidatedAICommands(commands);
        expect(limited.commands).toHaveLength(AI_COMMAND_MAX_COMMANDS);
        expect(limited.rejected.at(-1)?.reason).toBe('too many commands');

        const truncated = extractValidatedAICommands(`${'x'.repeat(AI_COMMAND_SCAN_MAX_CHARS)}[COMMAND: {"action":"layout"}]`);
        expect(truncated.truncated).toBe(true);
        expect(truncated.commands).toHaveLength(0);
        expect(truncated.rejected.at(-1)?.reason).toBe('command scan limit reached');
    });

    it('normalizes documented mindmap and animation commands', () => {
        expect(sanitizeValidatedAICommand({
            action: 'addChild',
            parentId: 'root',
            label: 'Child',
            side: 'right',
            unexpected: true,
        })).toEqual({
            action: 'addChild',
            label: 'Child',
            parentId: 'root',
            side: 'right',
        });

        expect(sanitizeValidatedAICommand({
            action: 'animatePath',
            params: { edgeIds: ['e1'], options: { duration: 1500, loop: true, extra: 'drop' } },
        })).toEqual({
            action: 'animatePath',
            ids: ['e1'],
            params: { edgeIds: ['e1'], options: { duration: 1500, loop: true } },
            duration: 1500,
            loop: true,
        });
    });

    it('extracts nested command JSON without truncating at the first closing brace', () => {
        const result = extractValidatedAICommands(`
            [COMMAND: {"action":"updateTheme","style":{"nodes":{"color":"#111","label":"brace } text"},"edges":{"stroke":"#222"}}}]
            [COMMAND: {"action":"animatePath","params":{"edgeIds":["e1"],"options":{"duration":1200,"loop":false}}}]
        `);

        expect(result.rejected).toEqual([]);
        expect(result.commands).toEqual([
            {
                action: 'updateTheme',
                style: {
                    nodes: { color: '#111', label: 'brace } text' },
                    edges: { stroke: '#222' },
                },
            },
            {
                action: 'animatePath',
                ids: ['e1'],
                params: { edgeIds: ['e1'], options: { duration: 1200, loop: false } },
                duration: 1200,
                loop: false,
            },
        ]);
    });
});
