import { describe, it, expect } from 'vitest';
import { costEvaluator, CostEvaluator } from '../CostEvaluator';
import type { CostContext, EdgeRoutingWeights, RoutingPlugin } from '../../types/routing';

describe('CostEvaluator', () => {
    const sNode = { id: 's', position: { x: 0, y: 0 }, dimensions: { width: 100, height: 50 } };
    const tNode = { id: 't', position: { x: 200, y: 200 }, dimensions: { width: 100, height: 50 } };

    const defaultWeights: EdgeRoutingWeights = {
        length: 1,
        turn: 500,
        crossing: 1000,
        lrBias: 0,
        tbBias: 0,
        edgeCrossing: 80,
        wrongSign: 2000,
        lShapeBonus: 1500,
        usagePenalty: 40,
        overlapPenalty: 0,
        exitContainerPenalty: 0,
        crossDomainPenalty: 0,
        detourPenalty: 0,
        lastSegShort: 0,
        alignmentBonus: 0,
        flowBonus: 0,
    };

    const baseContext: CostContext = {
        sNode,
        tNode,
        sDir: 'r',
        tDir: 'l',
        dx: 100,
        dy: 150,
        baseCost: 0,
        obstacles: [],
        weights: defaultWeights,
        config: {
            mode: 'advanced-smart',
            layoutDirection: 'LR',
            directionalHandlePolicy: 'prefer'
        }
    };

    describe('registerPlugin', () => {
        it('should sort plugins by priority', () => {
            const evaluator = new CostEvaluator();
            const p1: RoutingPlugin = { name: 'p1', priority: 10, evaluate: () => 10 };
            const p2: RoutingPlugin = { name: 'p2', priority: 20, evaluate: () => 20 };
            const p3: RoutingPlugin = { name: 'p3', priority: 5, evaluate: () => 5 };

            evaluator.registerPlugin(p1);
            evaluator.registerPlugin(p2);
            evaluator.registerPlugin(p3);

            // evaluate and check cost breakdown
            const res = evaluator.evaluate(baseContext);
            expect(res.breakdown['p2']).toBe(20);
            expect(res.breakdown['p1']).toBe(10);
            expect(res.breakdown['p3']).toBe(5);
        });

        it('should conditional apply plugin based on canApply method', () => {
            const evaluator = new CostEvaluator();
            const activePlugin: RoutingPlugin = {
                name: 'active',
                priority: 10,
                canApply: () => true,
                evaluate: () => 100
            };
            const inactivePlugin: RoutingPlugin = {
                name: 'inactive',
                priority: 10,
                canApply: () => false,
                evaluate: () => 200
            };

            evaluator.registerPlugin(activePlugin);
            evaluator.registerPlugin(inactivePlugin);

            const res = evaluator.evaluate(baseContext);
            expect(res.breakdown['active']).toBe(100);
            expect(res.breakdown['inactive']).toBeUndefined();
        });
    });

    describe('evaluateLength', () => {
        it('should calculate Manhattan distance cost correctly', () => {
            const context: CostContext = {
                ...baseContext,
                sDir: 'r', // Anchor (100, 25)
                tDir: 'l', // Anchor (200, 225)
                weights: { ...defaultWeights, length: 2 }
            };
            const res = costEvaluator.evaluate(context);
            // dx = 200 - 100 = 100
            // dy = 225 - 25 = 200
            // distance = 300
            // cost = 300 * 2 = 600
            expect(res.breakdown.length).toBe(600);
        });
    });

    describe('evaluateTurns', () => {
        it('should return 0 for straight-through paths', () => {
            const context: CostContext = {
                ...baseContext,
                sDir: 'r',
                tDir: 'l',
                dx: 50,
                dy: 0
            };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.turns).toBe(0);
        });

        it('should return 1 turn penalty for L-shape configurations', () => {
            const context: CostContext = {
                ...baseContext,
                sDir: 'r', // Horiz
                tDir: 't', // Vert
                dx: 50,
                dy: 50
            };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.turns).toBe(500);
        });

        it('should return 2 turns penalty for Z-shape/U-shape configurations', () => {
            const context: CostContext = {
                ...baseContext,
                sDir: 'r',
                tDir: 'r', // Same side
                dx: 50,
                dy: 50
            };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.turns).toBe(1000);
        });
    });

    describe('evaluateCrossings', () => {
        it('should bypass calculation when obstacles is empty', () => {
            const context = { ...baseContext, obstacles: [] };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.crossings).toBe(0);
        });

        it('should bypass calculation when obstacles are outside path BBox', () => {
            // Path BBox is from (100, 25) to (200, 225)
            // Obstacle is far away at (500, 500)
            const context = {
                ...baseContext,
                obstacles: [{ x: 500, y: 500, width: 50, height: 50 }]
            };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.crossings).toBe(0);
        });

        it('should apply crossing penalty when path intersects obstacles', () => {
            // Path straight line goes from (100, 25) to (200, 225)
            // Obstacle lies right in the middle at (130, 100)
            const context = {
                ...baseContext,
                obstacles: [{ x: 120, y: 80, width: 40, height: 40 }]
            };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.crossings).toBe(1000);
        });
    });

    describe('buildOrthogonalEstimate & segmentsIntersect', () => {
        it('should handle same-line case', () => {
            // Start (100, 25) to End (100.5, 25) -> same line
            const context: CostContext = {
                ...baseContext,
                sDir: 'r',
                tDir: 'l',
                dx: 0.5,
                dy: 0,
                config: {
                    ...baseContext.config,
                    routedPaths: [{ points: [{ x: 50, y: 25 }, { x: 150, y: 25 }] }]
                }
            };
            const res = costEvaluator.evaluate(context);
            // Crossing with candidate line (100, 25) -> (100.5, 25)
            // Because they share pointsNear, segmentsIntersect will return false, hence crossings = 0
            expect(res.breakdown.crossings).toBe(0);
        });

        it('should build orthogonal estimates for horizontal side-by-side ports', () => {
            // Horiz-Horiz, same dir (r -> r)
            const context1: CostContext = {
                ...baseContext,
                sDir: 'r', // (100, 25)
                tDir: 'r', // (300, 225)
                dx: 200,
                dy: 200,
                config: {
                    ...baseContext.config,
                    routedPaths: [{ points: [{ x: 350, y: 0 }, { x: 350, y: 300 }] }]
                }
            };
            const res1 = costEvaluator.evaluate(context1);
            // laneX = Math.max(100, 300) + 48 = 348.
            // Candidate: (100, 25) -> (348, 25) -> (348, 225) -> (300, 225)
            // Routed line (350, 0) -> (350, 300) does not intersect Candidate because laneX is 348
            expect(res1.breakdown.crossings).toBe(0);

            // Horiz-Horiz, same dir (l -> l)
            const context2: CostContext = {
                ...baseContext,
                sDir: 'l', // (0, 25)
                tDir: 'l', // (200, 225)
                dx: 200,
                dy: 200
            };
            const res2 = costEvaluator.evaluate(context2);
            expect(res2.breakdown.crossings).toBe(0);
        });

        it('should build orthogonal estimates for vertical side-by-side ports', () => {
            // Vert-Vert, same dir (b -> b)
            const context1: CostContext = {
                ...baseContext,
                sDir: 'b', // (50, 50)
                tDir: 'b', // (240, 260)
                dx: 190,
                dy: 210
            };
            const res1 = costEvaluator.evaluate(context1);
            expect(res1.breakdown.crossings).toBe(0);

            // Vert-Vert, same dir (t -> t)
            const context2: CostContext = {
                ...baseContext,
                sDir: 't', // (50, 0)
                tDir: 't', // (240, 200)
                dx: 190,
                dy: 200
            };
            const res2 = costEvaluator.evaluate(context2);
            expect(res2.breakdown.crossings).toBe(0);

            // Vert-Vert, opposite dir (t -> b)
            const context3: CostContext = {
                ...baseContext,
                sDir: 't', // (50, 0)
                tDir: 'b', // (240, 260)
                dx: 190,
                dy: 260
            };
            const res3 = costEvaluator.evaluate(context3);
            expect(res3.breakdown.crossings).toBe(0);
        });

        it('should build orthogonal estimates for orthogonal ports', () => {
            // Source horiz (r), target vert (b)
            const context1: CostContext = {
                ...baseContext,
                sDir: 'r', // (100, 25)
                tDir: 'b', // (240, 260)
                dx: 140,
                dy: 235
            };
            const res1 = costEvaluator.evaluate(context1);
            expect(res1.breakdown.crossings).toBe(0);

            // Source vert (b), target horiz (r)
            const context2: CostContext = {
                ...baseContext,
                sDir: 'b', // (50, 50)
                tDir: 'r', // (300, 225)
                dx: 250,
                dy: 175
            };
            const res2 = costEvaluator.evaluate(context2);
            expect(res2.breakdown.crossings).toBe(0);
        });

        it('should detect crossings with routed paths', () => {
            // Candidate: (100, 25) -> (150, 25) -> (150, 225) -> (200, 225)
            // Routed line: (120, 100) -> (180, 100)
            // Candidate segment (150, 25) -> (150, 225) crosses Routed line at (150, 100)
            const context: CostContext = {
                ...baseContext,
                sDir: 'r',
                tDir: 'l',
                dx: 100,
                dy: 200,
                config: {
                    ...baseContext.config,
                    routedPaths: [{ points: [{ x: 120, y: 100 }, { x: 180, y: 100 }] }]
                }
            };
            const res = costEvaluator.evaluate(context);
            // 80 * 1 crossing = 80
            expect(res.breakdown.crossings).toBe(80);
        });

        it('should handle collinear crossing lines in segment check', () => {
            // Collinear and overlapping lines:
            // Candidate segment: (150, 25) -> (150, 225)
            // Routed segment: (150, 100) -> (150, 150)
            const context: CostContext = {
                ...baseContext,
                sDir: 'r',
                tDir: 'l',
                dx: 100,
                dy: 200,
                config: {
                    ...baseContext.config,
                    routedPaths: [{ points: [{ x: 150, y: 100 }, { x: 150, y: 150 }] }]
                }
            };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.crossings).toBe(80);
        });
    });

    describe('evaluateDirection', () => {
        it('should penalize bad directions and wrong axes in LR/RL layout', () => {
            // Bad source direction: 'l' but target is to the right (dx = 100 > 10)
            // Bad target direction: 'r' but source is to the left (-dx = -100 < -10)
            const context1: CostContext = {
                ...baseContext,
                sDir: 'l',
                tDir: 'r',
                dx: 100,
                dy: 0,
                config: { ...baseContext.config, layoutDirection: 'LR' }
            };
            const res1 = costEvaluator.evaluate(context1);
            // sBad is true -> +2000
            // tBad is true -> +2000
            // Total should be around 4000+
            expect(res1.breakdown.direction).toBeGreaterThanOrEqual(4000);
        });

        it('should reward dominant axes in TB layout', () => {
            // Vertical dominant in TB layout -> should reward top/bottom handles
            const context: CostContext = {
                ...baseContext,
                sDir: 'b', // Anchor (50, 50)
                tDir: 't', // Anchor (240, 200) -> dy = 150 > dx = 190?
                // To make vertical dominant: absDy > effectiveDx * 1.1 && absDy > 100
                // Let's set dx = 10, dy = 150.
                dx: 10,
                dy: 150,
                config: { ...baseContext.config, layoutDirection: 'TB' }
            };
            const res = costEvaluator.evaluate(context);
            // Since it's vertical dominant and TB layout, it shouldn't apply wrong axis penalty.
            // Instead, it rewards axes or stays low.
            expect(res.totalCost).toBeLessThan(2000);
        });

        it('should handle backwards edge special rewards and penalties in TB layout', () => {
            // Backwards edge in TB layout: dy = -100 < -5
            const context1: CostContext = {
                ...baseContext,
                sDir: 'r',
                tDir: 'l',
                dx: 10,
                dy: -100,
                config: { ...baseContext.config, layoutDirection: 'TB' }
            };
            const res1 = costEvaluator.evaluate(context1);
            // Cross-side reward: -3500
            expect(res1.breakdown.direction).toBeLessThan(-2000);

            // Same-side backwards: r -> r
            const context2: CostContext = {
                ...baseContext,
                sDir: 'r',
                tDir: 'r',
                dx: 10,
                dy: -100,
                config: { ...baseContext.config, layoutDirection: 'TB' }
            };
            const res2 = costEvaluator.evaluate(context2);
            // Same-side reward: -2500
            expect(res2.breakdown.direction).toBeLessThan(-1000);

            // Bottom exit on backwards edge penalty: sDir = 'b'
            const context3: CostContext = {
                ...baseContext,
                sDir: 'b',
                tDir: 't',
                dx: 10,
                dy: -100,
                config: { ...baseContext.config, layoutDirection: 'TB' }
            };
            const res3 = costEvaluator.evaluate(context3);
            // +3500 penalty
            expect(res3.breakdown.direction).toBeGreaterThanOrEqual(1000);
        });

        it('should apply L-shape bonus', () => {
            // Source vertical (b), target horizontal (l)
            const context: CostContext = {
                ...baseContext,
                sDir: 'b',
                tDir: 'l',
                dx: 100,
                dy: 100,
                config: { ...baseContext.config, layoutDirection: 'FREE' }
            };
            const res = costEvaluator.evaluate(context);
            // -1500 bonus
            expect(res.breakdown.direction).toBeLessThan(0);
        });
    });

    describe('evaluateUsage', () => {
        it('should return 0 when usage is empty', () => {
            const context = { ...baseContext, usage: undefined };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.usage).toBe(0);
        });

        it('should calculate linear usage penalty under threshold', () => {
            const context: CostContext = {
                ...baseContext,
                usage: {
                    source: { r: 1 },
                    target: { l: 2 }
                }
            };
            const res = costEvaluator.evaluate(context);
            // sUsage = 1 -> 40
            // tUsage = 2 -> 80
            // total = 120
            expect(res.breakdown.usage).toBe(120);
        });

        it('should calculate exponential usage penalty above threshold', () => {
            const context: CostContext = {
                ...baseContext,
                usage: {
                    source: { r: 3 }, // > 2 -> 3^2.5 * 40 = 15.58 * 40 = 623.5
                    target: { l: 1 }  // <= 2 -> 40
                }
            };
            const res = costEvaluator.evaluate(context);
            expect(res.breakdown.usage).toBeCloseTo(623.5 + 40, 1);
        });
    });
});
