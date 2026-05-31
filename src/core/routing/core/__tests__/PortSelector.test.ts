import { describe, it, expect } from 'vitest';
import { portSelector } from '../PortSelector';
import { NodeGeometry, RoutingConfig, EdgeRoutingWeights } from '../../types/routing';

describe('PortSelector', () => {
    const sNode: NodeGeometry = {
        id: 'source',
        position: { x: 10, y: 10 },
        dimensions: { width: 100, height: 50 }
    };
    const tNode: NodeGeometry = {
        id: 'target',
        position: { x: 200, y: 200 },
        dimensions: { width: 80, height: 60 }
    };

    const defaultWeights: EdgeRoutingWeights = {
        length: 1,
        turn: 500,
        crossing: 1000,
        edgeCrossing: 80,
        wrongSign: 2000,
        lShapeBonus: 1500,
        usagePenalty: 40
    };

    const defaultConfig: RoutingConfig = {
        layoutDirection: 'LR',
        directionalHandlePolicy: 'prefer'
    };

    describe('selectOptimalPorts', () => {
        it('should return pre-assigned ports directly when handle policy is force', () => {
            const config: RoutingConfig = {
                ...defaultConfig,
                directionalHandlePolicy: 'force',
                preAssignedPorts: {
                    source: { source: 't' },
                    target: { target: 'b' }
                }
            };
            const result = portSelector.selectOptimalPorts(sNode, tNode, config, defaultWeights);
            expect(result).toEqual({
                sourceHandle: 't',
                targetHandle: 'b',
                cost: 0,
                autoSource: false,
                autoTarget: false
            });
        });

        it('should treat pre-assigned ports as soft hints when handle policy is prefer', () => {
            const config: RoutingConfig = {
                ...defaultConfig,
                preAssignedPorts: {
                    source: { source: 't' },
                    target: { target: 'b' }
                }
            };
            const result = portSelector.selectOptimalPorts(sNode, tNode, config, defaultWeights);
            expect(result).toMatchObject({
                sourceHandle: 'r',
                targetHandle: 'l',
                autoSource: true,
                autoTarget: true
            });
            expect(result.cost).toBeLessThan(Infinity);
        });

        it('should allow forced direction without hard-locking automatic pre-assigned ports', () => {
            const config: RoutingConfig = {
                ...defaultConfig,
                directionalHandlePolicy: 'force',
                preAssignedPortPolicy: 'prefer',
                preAssignedPorts: {
                    source: { source: 't' },
                    target: { target: 'b' }
                }
            };
            const result = portSelector.selectOptimalPorts(sNode, tNode, config, defaultWeights);
            expect(result).toMatchObject({
                sourceHandle: 'r',
                targetHandle: 'l',
                autoSource: true,
                autoTarget: true
            });
        });

        it('should evaluate candidates using costEvaluator and return the one with minimum cost', () => {
            const result = portSelector.selectOptimalPorts(sNode, tNode, defaultConfig, defaultWeights);
            expect(result.sourceHandle).toBeDefined();
            expect(result.targetHandle).toBeDefined();
            expect(result.cost).toBeLessThan(Infinity);
            expect(result.autoSource).toBe(true);
            expect(result.autoTarget).toBe(true);
        });

        it('should fallback to default ports if no candidates match (stubbing candidates to empty)', () => {
            const originalGenerate = (portSelector as any).generateCandidates;
            (portSelector as any).generateCandidates = () => [];

            try {
                const result = portSelector.selectOptimalPorts(sNode, tNode, defaultConfig, defaultWeights);
                // default ports fallback: isHorizontalDominant is false because dx = 180, dy = 195 (not dominant)
                // it should fallback to dy >= 0 ? { source: 'b', target: 't' } : { source: 't', target: 'b' }
                // Here, dy = 195 >= 0, so source: 'b', target: 't'
                expect(result.sourceHandle).toBe('b');
                expect(result.targetHandle).toBe('t');
                expect(result.cost).toBe(0);
            } finally {
                (portSelector as any).generateCandidates = originalGenerate;
            }
        });
    });

    describe('generateCandidates (via private access)', () => {
        const callGenerateCandidates = (
            source: NodeGeometry,
            target: NodeGeometry,
            config: RoutingConfig,
            geo: any
        ) => {
            return (portSelector as any).generateCandidates(source, target, config, geo);
        };

        it('should perform horizontal dominant pruning when isHorizontalDominant = true and not backwards', () => {
            const geo = {
                layoutDirection: 'LR',
                isBackwards: false,
                isHorizontalDominant: true,
                isVerticalDominant: false,
                dx: 200,
                dy: 10
            };
            const candidates = callGenerateCandidates(sNode, tNode, defaultConfig, geo);
            expect(candidates).toEqual(expect.arrayContaining([
                { source: 'r', target: 'l' },
                { source: 'l', target: 'r' },
                { source: 'r', target: 't' },
                { source: 'r', target: 'b' }
            ]));
            expect(candidates.length).toBeLessThanOrEqual(9);
        });

        it('should perform vertical dominant pruning when isVerticalDominant = true and not backwards', () => {
            const geo = {
                layoutDirection: 'TB',
                isBackwards: false,
                isHorizontalDominant: false,
                isVerticalDominant: true,
                dx: 10,
                dy: 200
            };
            const candidates = callGenerateCandidates(sNode, tNode, defaultConfig, geo);
            expect(candidates).toEqual(expect.arrayContaining([
                { source: 'b', target: 't' },
                { source: 't', target: 'b' },
                { source: 'b', target: 'r' },
                { source: 'b', target: 'l' }
            ]));
            expect(candidates.length).toBeLessThanOrEqual(9);
        });

        it('should retain all 16 candidates under diagonal or backwards case', () => {
            const geo = {
                layoutDirection: 'LR',
                isBackwards: false,
                isHorizontalDominant: false,
                isVerticalDominant: false,
                dx: 100,
                dy: 100
            };
            const candidates = callGenerateCandidates(sNode, tNode, defaultConfig, geo);
            expect(candidates.length).toBe(16);
        });

        it('should handle backwards edge same-side prioritization for TB/BT layouts (dx >= 0)', () => {
            const geo = {
                layoutDirection: 'TB',
                isBackwards: true,
                isHorizontalDominant: false,
                isVerticalDominant: false,
                dx: 50,
                dy: -100
            };
            const candidates = callGenerateCandidates(sNode, tNode, defaultConfig, geo);
            // geometric primary is b->t or t->b (since dy = -100, layoutDir = TB, it is t->b, so candidates[0] is t->b)
            // candidates[1] and candidates[2] should be preferred same-side candidates (r->r, then l->l)
            expect(candidates[1]).toEqual({ source: 'r', target: 'r' });
            expect(candidates[2]).toEqual({ source: 'l', target: 'l' });
        });

        it('should handle backwards edge same-side prioritization for TB/BT layouts (dx < 0)', () => {
            const geo = {
                layoutDirection: 'TB',
                isBackwards: true,
                isHorizontalDominant: false,
                isVerticalDominant: false,
                dx: -50,
                dy: -100
            };
            const candidates = callGenerateCandidates(sNode, tNode, defaultConfig, geo);
            // geometric primary is t->b, candidates[1] and candidates[2] should be preferred same-side (l->l, then r->r)
            expect(candidates[1]).toEqual({ source: 'l', target: 'l' });
            expect(candidates[2]).toEqual({ source: 'r', target: 'r' });
        });

        it('should apply strict horizontal filtering in TB/BT layout when isStrictHorizontal = true', () => {
            const geo = {
                layoutDirection: 'TB',
                isBackwards: false,
                isHorizontalDominant: true,
                isVerticalDominant: false,
                dx: 200,
                dy: 20
            };
            const candidates = callGenerateCandidates(sNode, tNode, defaultConfig, geo);
            // Geometric primary is b->t, so candidates[0] is b->t
            expect(candidates[0]).toEqual({ source: 'b', target: 't' });
            // The rest of candidates must be strictly horizontal (l or r only)
            candidates.slice(1).forEach((c: any) => {
                expect(['l', 'r']).toContain(c.source);
                expect(['l', 'r']).toContain(c.target);
            });
        });

        it('should fallback to default strict horizontal candidate if filtered results are empty', () => {
            const geoPositive = {
                layoutDirection: 'TB',
                isBackwards: false,
                isHorizontalDominant: false,
                isVerticalDominant: true, // This ensures no horizontal ports are initially created
                dx: 200,
                dy: 20
            };
            const candPositive = callGenerateCandidates(sNode, tNode, defaultConfig, geoPositive);
            // First item is geometric primary (b->t)
            expect(candPositive[0]).toEqual({ source: 'b', target: 't' });
            // Since filtered was empty, it should fall back to geo.dx >= 0 ? { r, l } : { l, r }
            // With dx = 200 >= 0, it falls back to { source: 'r', target: 'l' }
            expect(candPositive[1]).toEqual({ source: 'r', target: 'l' });
        });

        it('should prepend the geometric primary candidate to candidates list for various layout directions', () => {
            const testPrimary = (layoutDir: string, dy: number, dx: number, expected: any) => {
                const geo = {
                    layoutDirection: layoutDir,
                    isBackwards: false,
                    isHorizontalDominant: false,
                    isVerticalDominant: false,
                    dx,
                    dy
                };
                const candidates = callGenerateCandidates(sNode, tNode, defaultConfig, geo);
                expect(candidates[0]).toEqual(expected);
            };

            testPrimary('TB', 100, 0, { source: 'b', target: 't' });
            testPrimary('TB', -100, 0, { source: 't', target: 'b' });

            testPrimary('BT', -100, 0, { source: 't', target: 'b' });
            testPrimary('BT', 100, 0, { source: 'b', target: 't' });

            testPrimary('LR', 0, 100, { source: 'r', target: 'l' });
            testPrimary('LR', 0, -100, { source: 'l', target: 'r' });

            testPrimary('RL', 0, -100, { source: 'l', target: 'r' });
            testPrimary('RL', 0, 100, { source: 'r', target: 'l' });
        });

        it('should return null for getPrimaryCandidate if layoutDirection is FREE', () => {
            const geo = {
                layoutDirection: 'FREE',
                isBackwards: false,
                isHorizontalDominant: false,
                isVerticalDominant: false,
                dx: 0,
                dy: 0
            };
            const primary = (portSelector as any).getPrimaryCandidate(geo);
            expect(primary).toBeNull();
        });

        it('should append pre-assigned ports to candidate list if they are not already present', () => {
            const configWithPre: RoutingConfig = {
                ...defaultConfig,
                preAssignedPorts: {
                    source: { source: 't' },
                    target: { target: 'b' }
                }
            };
            const geo = {
                layoutDirection: 'LR',
                isBackwards: false,
                isHorizontalDominant: true,
                isVerticalDominant: false,
                dx: 200,
                dy: 10
            };
            const candidates = callGenerateCandidates(sNode, tNode, configWithPre, geo);
            expect(candidates).toContainEqual({ source: 't', target: 'b' });
        });
    });

    describe('getDefaultPorts fallback helper', () => {
        it('should return horizontal fallback when isHorizontalDominant is true', () => {
            const geo = {
                isHorizontalDominant: true,
                dx: 100,
                dy: 10
            };
            const fallback = (portSelector as any).getDefaultPorts(geo);
            expect(fallback).toEqual({ source: 'r', target: 'l' });

            const geoNeg = {
                isHorizontalDominant: true,
                dx: -100,
                dy: 10
            };
            const fallbackNeg = (portSelector as any).getDefaultPorts(geoNeg);
            expect(fallbackNeg).toEqual({ source: 'l', target: 'r' });
        });

        it('should return vertical fallback when isHorizontalDominant is false', () => {
            const geo = {
                isHorizontalDominant: false,
                dx: 10,
                dy: 100
            };
            const fallback = (portSelector as any).getDefaultPorts(geo);
            expect(fallback).toEqual({ source: 'b', target: 't' });

            const geoNeg = {
                isHorizontalDominant: false,
                dx: 10,
                dy: -100
            };
            const fallbackNeg = (portSelector as any).getDefaultPorts(geoNeg);
            expect(fallbackNeg).toEqual({ source: 't', target: 'b' });
        });
    });
});
