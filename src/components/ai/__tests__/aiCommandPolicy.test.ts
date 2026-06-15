import { describe, expect, it } from 'vitest';
import { getAICommandIds, validateAutonomousAICommand } from '../aiCommandPolicy';

describe('aiCommandPolicy', () => {
    it('allows low-risk canvas commands with valid shape', () => {
        expect(validateAutonomousAICommand({ action: 'addNode', label: 'API Gateway' }).allowed).toBe(true);
        expect(validateAutonomousAICommand({ action: 'connectNodes', source: 'a', target: 'b' }).allowed).toBe(true);
        expect(validateAutonomousAICommand({ action: 'layout', strategy: 'dagre' }).allowed).toBe(true);
    });

    it('blocks destructive or external side-effect commands from autonomous AI output', () => {
        for (const action of ['deleteNodes', 'export', 'exportMindmapMd', 'save', 'share']) {
            const result = validateAutonomousAICommand({ action, ids: ['a'] });
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('requires explicit user action');
        }
    });

    it('blocks unknown plugin commands before plugin dispatch', () => {
        expect(validateAutonomousAICommand({ action: 'runShell', command: 'rm -rf .' }).allowed).toBe(false);
    });

    it('validates command payload boundaries', () => {
        expect(validateAutonomousAICommand({ action: 'connectNodes', source: 'a' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'groupNodes', ids: [] }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'groupNodes',
            ids: Array.from({ length: 51 }, (_, index) => `node-${index}`),
        }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'connectNodes',
            source: 'a',
            target: 'b',
            label: 'x'.repeat(201),
        }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'layout', strategy: 'dagre;alert(1)' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'addNode', label: 'API', shape: 'rect<script>' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'presentation', active: 'yes' }).allowed).toBe(false);
    });

    it('requires safe node and edge identifiers for autonomous commands', () => {
        for (const id of ['bad id', '<script>', '__proto__', 'constructor', 'prototype']) {
            expect(validateAutonomousAICommand({ action: 'connectNodes', source: id, target: 'safe' }).allowed).toBe(false);
            expect(validateAutonomousAICommand({ action: 'connectNodes', source: 'safe', target: id }).allowed).toBe(false);
            expect(validateAutonomousAICommand({ action: 'groupNodes', ids: ['safe', id] }).allowed).toBe(false);
            expect(validateAutonomousAICommand({ action: 'addChild', parentId: id, label: 'Child' }).allowed).toBe(false);
            expect(validateAutonomousAICommand({ action: 'collapse', id, collapsed: true }).allowed).toBe(false);
            expect(validateAutonomousAICommand({ action: 'animatePath', ids: [id] }).allowed).toBe(false);
        }

        expect(validateAutonomousAICommand({ action: 'connectNodes', source: 'node-1', target: 'node_2:out' }).allowed).toBe(true);
        expect(validateAutonomousAICommand({ action: 'groupNodes', ids: ['node-1', 'node_2:out'] }).allowed).toBe(true);
    });

    it('accepts legacy and documented edge id payload shapes', () => {
        expect(getAICommandIds({ action: 'animatePath', ids: ['e1'] })).toEqual(['e1']);
        expect(getAICommandIds({ action: 'animatePath', params: { edgeIds: ['e2'] } })).toEqual(['e2']);
        expect(validateAutonomousAICommand({ action: 'animatePath', params: { edgeIds: ['e2'] } }).allowed).toBe(true);
    });

    it('validates mindmap child and collapse command fields', () => {
        expect(validateAutonomousAICommand({ action: 'addChild', parentId: 'root', label: 'Child', side: 'right' }).allowed).toBe(true);
        expect(validateAutonomousAICommand({ action: 'addChild', label: 'Child' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'addChild', parentId: 'root', label: 'Child', side: '<script>' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'collapse', id: 'root', collapsed: true }).allowed).toBe(true);
        expect(validateAutonomousAICommand({ action: 'collapse', id: 'root', collapsed: 'yes' }).allowed).toBe(false);
    });

    it('requires bounded plain-object theme updates', () => {
        expect(validateAutonomousAICommand({ action: 'updateTheme' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'updateTheme', style: 'color:red' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'updateTheme', style: [] }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'updateTheme',
            style: Object.fromEntries(Array.from({ length: 41 }, (_, index) => [`k${index}`, '#fff'])),
        }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'updateTheme',
            style: { edge: { stroke: { color: '#fff' } } },
        }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'updateTheme',
            style: JSON.parse('{"__proto__":{"polluted":true},"node":{"fill":"#fff"}}'),
        }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'updateTheme',
            style: { node: { constructor: 'Object' } },
        }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'updateTheme',
            style: { node: { fill: '#fff', radius: 8 }, edge: { stroke: '#222' } },
        }).allowed).toBe(true);
    });

    it('bounds animation options before execution', () => {
        expect(validateAutonomousAICommand({ action: 'animatePath', ids: ['e1'], duration: Number.POSITIVE_INFINITY }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'animatePath', ids: ['e1'], duration: 60_001 }).allowed).toBe(false);
        expect(validateAutonomousAICommand({ action: 'animatePath', ids: ['e1'], loop: 'yes' }).allowed).toBe(false);
        expect(validateAutonomousAICommand({
            action: 'animatePath',
            params: { edgeIds: ['e1'], options: { duration: 1500, loop: true } },
        }).allowed).toBe(true);
    });
});
