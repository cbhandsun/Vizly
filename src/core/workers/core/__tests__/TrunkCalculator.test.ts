import { describe, it, expect } from 'vitest';
import { TrunkCalculator, TrunkResult } from '../TrunkCalculator';
import { Rectangle, Point } from '../../../algorithms/geometryUtils';
import { UnifiedRoutingConfig } from '../../../types/routing';

describe('TrunkCalculator', () => {
    const trunkCalculator = new TrunkCalculator();

    const hubNode: Rectangle = { x: 100, y: 100, width: 80, height: 60 };
    // Hub center: x = 140, y = 130
    
    const defaultConfig: UnifiedRoutingConfig = {
        bus: {
            trunkBase: 40,
            trunkMultiplier: 10,
            parallelTrunkSpacing: 60,
            parallelTrunkStrategy: 'count-based'
        }
    };

    describe('shouldUseTrunkRouting', () => {
        it('should return true when peerCount is above or equal to threshold', () => {
            expect(trunkCalculator.shouldUseTrunkRouting(3, 2)).toBe(true);
            expect(trunkCalculator.shouldUseTrunkRouting(2, 2)).toBe(true);
        });

        it('should return false when peerCount is below threshold', () => {
            expect(trunkCalculator.shouldUseTrunkRouting(1, 2)).toBe(false);
            expect(trunkCalculator.shouldUseTrunkRouting(0, 3)).toBe(false);
        });

        it('should use default threshold = 2 if not provided', () => {
            expect(trunkCalculator.shouldUseTrunkRouting(2)).toBe(true);
            expect(trunkCalculator.shouldUseTrunkRouting(1)).toBe(false);
        });
    });

    describe('calculateTrunkPoint', () => {
        const peers = [
            { x: 10, y: 10, width: 10, height: 10 },
            { x: 20, y: 20, width: 10, height: 10 }
        ];
        // centroid is { x: 20, y: 20 }, hub center is { x: 140, y: 130 }
        // dx = 120, dy = 110. dx > dy -> isHorizontal = true
        // trunkLength = 40 + 2 * 10 = 60

        it('should calculate trunk point for Many-to-One horizontal logic', () => {
            // isManyToOne = true, centroid.x < hubCenter.x (20 < 140) -> isFromLeft = true
            // trunkPoint.x = hubNode.x (100) - trunkLength (60) = 40
            // trunkPoint.y = hubCenter.y (130)
            // suggestedPort = 'left'
            const result = trunkCalculator.calculateTrunkPoint(hubNode, peers, true, defaultConfig);
            expect(result).toEqual({
                trunkPoint: { x: 40, y: 130 },
                trunkDirection: 'horizontal',
                suggestedPort: 'left'
            });
        });

        it('should calculate trunk point for Many-to-One horizontal logic (from right)', () => {
            const peersRight = [
                { x: 300, y: 100, width: 20, height: 20 }
            ];
            // centroid = 310, hubCenter = 140 -> right
            // trunkLength = 40 + 1 * 10 = 50
            // trunkPoint.x = hubNode.x + width (180) + 50 = 230
            // suggestedPort = 'right'
            const result = trunkCalculator.calculateTrunkPoint(hubNode, peersRight, true, defaultConfig);
            expect(result.trunkPoint.x).toBe(230);
            expect(result.suggestedPort).toBe('right');
        });

        it('should calculate trunk point for Many-to-One vertical logic', () => {
            const peersTop = [
                { x: 130, y: 0, width: 20, height: 20 }
            ];
            // centroid x=140, y=10 -> dy = 120 > dx = 0 -> isHorizontal = false
            // trunkLength = 50
            // trunkPoint.x = hubCenter.x = 140
            // trunkPoint.y = hubNode.y (100) - 50 = 50
            // suggestedPort = 'top'
            const result = trunkCalculator.calculateTrunkPoint(hubNode, peersTop, true, defaultConfig);
            expect(result).toEqual({
                trunkPoint: { x: 140, y: 50 },
                trunkDirection: 'vertical',
                suggestedPort: 'top'
            });
        });

        it('should calculate trunk point for Many-to-One vertical logic (from bottom)', () => {
            const peersBottom = [
                { x: 130, y: 300, width: 20, height: 20 }
            ];
            const result = trunkCalculator.calculateTrunkPoint(hubNode, peersBottom, true, defaultConfig);
            expect(result.trunkPoint.y).toBe(210); // 160 + 50
            expect(result.suggestedPort).toBe('bottom');
        });

        it('should calculate trunk point for One-to-Many horizontal logic', () => {
            // isManyToOne = false
            // peers on left: centroid.x < hubCenter.x -> isToRight = false
            // trunkPoint.x = hubNode.x - trunkLength = 40
            const result = trunkCalculator.calculateTrunkPoint(hubNode, peers, false, defaultConfig);
            expect(result.trunkPoint.x).toBe(40);
            expect(result.suggestedPort).toBe('left');
        });

        it('should calculate trunk point for One-to-Many horizontal logic (to right)', () => {
            const peersRight = [
                { x: 300, y: 100, width: 20, height: 20 }
            ];
            const result = trunkCalculator.calculateTrunkPoint(hubNode, peersRight, false, defaultConfig);
            expect(result.trunkPoint.x).toBe(230);
            expect(result.suggestedPort).toBe('right');
        });

        it('should calculate trunk point for One-to-Many vertical logic (to top/bottom)', () => {
            const peersTop = [
                { x: 130, y: 0, width: 20, height: 20 }
            ];
            const resultTop = trunkCalculator.calculateTrunkPoint(hubNode, peersTop, false, defaultConfig);
            expect(resultTop.trunkPoint.y).toBe(50);
            expect(resultTop.suggestedPort).toBe('top');

            const peersBottom = [
                { x: 130, y: 300, width: 20, height: 20 }
            ];
            const resultBottom = trunkCalculator.calculateTrunkPoint(hubNode, peersBottom, false, defaultConfig);
            expect(resultBottom.trunkPoint.y).toBe(210);
            expect(resultBottom.suggestedPort).toBe('bottom');
        });
    });

    describe('calculateTreeTrunk', () => {
        it('should return safe fallback when peerNodes is empty (LR/RL)', () => {
            const result = trunkCalculator.calculateTreeTrunk(hubNode, [], true, defaultConfig, 'LR');
            expect(result).toEqual({
                axis: hubNode.x + hubNode.width + 40,
                direction: 'vertical',
                range: { min: 130, max: 130 },
                suggestedPort: 'right'
            });
        });

        it('should return safe fallback when peerNodes is empty (TB/BT)', () => {
            const result = trunkCalculator.calculateTreeTrunk(hubNode, [], true, defaultConfig, 'TB');
            expect(result).toEqual({
                axis: hubNode.y + hubNode.height + 40,
                direction: 'horizontal',
                range: { min: 140, max: 140 },
                suggestedPort: 'bottom'
            });
        });

        it('should force vertical flow mode (horizontal trunk) if dy is dominant', () => {
            const peersVertical = [
                { x: 100, y: 400, width: 80, height: 60 }
            ];
            // dy = 330 - 130 = 200, dx = 140 - 140 = 0. dy > dx * 1.5 -> force vertical flow mode (isHorizontal = false)
            const result = trunkCalculator.calculateTreeTrunk(hubNode, peersVertical, true, defaultConfig, 'LR');
            expect(result.direction).toBe('horizontal');
            expect(result.suggestedPort).toBe('bottom');
        });

        it('uses a bottom trunk for lower-left fan-outs that are still vertical process flow', () => {
            const fixQuota: Rectangle = { x: 1102, y: 294, width: 252, height: 96 };
            const greedySpec: Rectangle = { x: 114, y: 1478, width: 204, height: 96 };

            const result = trunkCalculator.calculateTreeTrunk(fixQuota, [greedySpec], false, defaultConfig, 'LR');

            expect(result.direction).toBe('horizontal');
            expect(result.suggestedPort).toBe('bottom');
            expect(result.axis).toBeGreaterThanOrEqual(fixQuota.y + fixQuota.height + 30);
        });

        it('delays long O2M vertical fan-out splitting until near the peer layer', () => {
            const fixQuota: Rectangle = { x: 379.8, y: 2594, width: 252, height: 96 };
            const peers: Rectangle[] = [
                { x: 82, y: 3094, width: 220, height: 96 },
                { x: 430, y: 3094, width: 220, height: 96 },
            ];

            const result = trunkCalculator.calculateTreeTrunk(fixQuota, peers, false, defaultConfig, 'LR');

            expect(result.direction).toBe('horizontal');
            expect(result.suggestedPort).toBe('bottom');
            expect(result.axis).toBeGreaterThan(fixQuota.y + fixQuota.height + 200);
            expect(result.axis).toBeLessThan(peers[0].y - 40);
        });

        it('should force horizontal flow mode (vertical trunk) if dx is dominant', () => {
            const peersHorizontal = [
                { x: 400, y: 100, width: 80, height: 60 }
            ];
            // dx = 200, dy = 0 -> force horizontal flow mode (isHorizontal = true)
            const result = trunkCalculator.calculateTreeTrunk(hubNode, peersHorizontal, true, defaultConfig, 'TB');
            expect(result.direction).toBe('vertical');
            expect(result.suggestedPort).toBe('right');
        });

        it('should calculate tree trunk on the left when peers are to the left', () => {
            const peersLeft = [
                { x: 0, y: 100, width: 40, height: 40 }
            ];
            const result = trunkCalculator.calculateTreeTrunk(hubNode, peersLeft, true, defaultConfig, 'LR');
            expect(result.direction).toBe('vertical');
            expect(result.suggestedPort).toBe('left');
            // axis should be calculated and bound to hubNode.x - spacing
            expect(result.axis).toBeLessThanOrEqual(hubNode.x - 30);
        });

        it('should calculate tree trunk on the right when peers are to the right', () => {
            const peersRight = [
                { x: 300, y: 100, width: 40, height: 40 }
            ];
            const result = trunkCalculator.calculateTreeTrunk(hubNode, peersRight, true, defaultConfig, 'LR');
            expect(result.direction).toBe('vertical');
            expect(result.suggestedPort).toBe('right');
            expect(result.axis).toBeGreaterThanOrEqual(hubNode.x + hubNode.width + 30);
        });

        it('should calculate tree trunk on top when peers are above', () => {
            const peersTop = [
                { x: 100, y: 0, width: 40, height: 40 }
            ];
            const result = trunkCalculator.calculateTreeTrunk(hubNode, peersTop, true, defaultConfig, 'TB');
            expect(result.direction).toBe('horizontal');
            expect(result.suggestedPort).toBe('top');
            expect(result.axis).toBeLessThanOrEqual(hubNode.y - 30);
        });

        it('should calculate tree trunk on bottom when peers are below', () => {
            const peersBottom = [
                { x: 100, y: 300, width: 40, height: 40 }
            ];
            const result = trunkCalculator.calculateTreeTrunk(hubNode, peersBottom, true, defaultConfig, 'TB');
            expect(result.direction).toBe('horizontal');
            expect(result.suggestedPort).toBe('bottom');
            expect(result.axis).toBeGreaterThanOrEqual(hubNode.y + hubNode.height + 30);
        });

        describe('obstacle avoidance in calculateTreeTrunk', () => {
            it('should filter out hubNode and peerNodes from obstacles', () => {
                const peers = [{ x: 300, y: 100, width: 40, height: 40 }];
                // Place an obstacle that overlaps the hubNode. If not filtered, it might cause push logic.
                const obstacles = [
                    { ...hubNode },
                    { ...peers[0] }
                ];
                const result = trunkCalculator.calculateTreeTrunk(hubNode, peers, true, defaultConfig, 'LR', undefined, obstacles);
                // Should run without infinite loop or wrong push
                expect(result.axis).toBeDefined();
            });

            it('should push vertical trunk further left if blocked on the left', () => {
                const peers = [{ x: 0, y: 100, width: 20, height: 20 }]; // pBounds.maxX = 20, hub.x = 100
                // Default vertical trunk left axis would be around Math.max(30, Math.min(preferred(100 - 60 = 40), 60)) = 40.
                // We place a blocker right at x=35 to x=45, y=50 to y=150.
                const blocker = { x: 30, y: 80, width: 20, height: 40 }; // blocks axis x=40
                const result = trunkCalculator.calculateTreeTrunk(hubNode, peers, true, defaultConfig, 'LR', undefined, [blocker]);
                // Left trunk push: pushes left, snaps to grid downward.
                // blocker.x = 30 -> clearAxis = 30 - 40 = -10 -> grid snap = -20
                expect(result.axis).toBeLessThanOrEqual(-20);
            });

            it('should push vertical trunk further right if blocked on the right', () => {
                const peers = [{ x: 300, y: 100, width: 20, height: 20 }]; // pBounds.minX = 300, hub.x + width = 180
                // Right trunk axis around 240
                // Blocker at x=235 to x=250
                const blocker = { x: 230, y: 80, width: 20, height: 40 };
                const result = trunkCalculator.calculateTreeTrunk(hubNode, peers, true, defaultConfig, 'LR', undefined, [blocker]);
                // Right trunk push: pushes right, snaps to grid upward.
                // blocker.x + width = 250 -> clearAxis = 250 + 40 = 290 -> grid snap = 300
                expect(result.axis).toBeGreaterThanOrEqual(290);
            });

            it('should push horizontal trunk further top if blocked on top', () => {
                const peers = [{ x: 100, y: 0, width: 20, height: 20 }]; // hub.y = 100
                // Top trunk axis around 40
                const blocker = { x: 80, y: 30, width: 40, height: 20 };
                const result = trunkCalculator.calculateTreeTrunk(hubNode, peers, true, defaultConfig, 'TB', undefined, [blocker]);
                // Top trunk push: pushes top, snaps to grid downward.
                expect(result.axis).toBeLessThanOrEqual(0);
            });

            it('should push horizontal trunk further bottom if blocked on bottom', () => {
                const peers = [{ x: 100, y: 300, width: 20, height: 20 }]; // hub.y + height = 160
                // Bottom trunk axis around 220
                const blocker = { x: 80, y: 210, width: 40, height: 20 };
                const result = trunkCalculator.calculateTreeTrunk(hubNode, peers, true, defaultConfig, 'TB', undefined, [blocker]);
                // Bottom trunk push: pushes bottom, snaps to grid upward.
                expect(result.axis).toBeGreaterThanOrEqual(240);
            });
        });
    });

    describe('calculateCentroid private method coverage', () => {
        it('should return {0,0} when nodes is empty', () => {
            const centroid = (trunkCalculator as any).calculateCentroid([]);
            expect(centroid).toEqual({ x: 0, y: 0 });
        });
    });

    describe('calculateParallelTrunks', () => {
        const forwardPeers = [{ x: 300, y: 50, width: 40, height: 40 }];
        const backwardPeers = [{ x: 300, y: 200, width: 40, height: 40 }];

        it('should return only backward trunk if forwardPeers is empty', () => {
            const result = trunkCalculator.calculateParallelTrunks(hubNode, [], backwardPeers, true, defaultConfig, 'LR');
            expect(result.forward).toBeUndefined();
            expect(result.backward).toBeDefined();
        });

        it('should return only forward trunk if backwardPeers is empty', () => {
            const result = trunkCalculator.calculateParallelTrunks(hubNode, forwardPeers, [], true, defaultConfig, 'LR');
            expect(result.backward).toBeUndefined();
            expect(result.forward).toBeDefined();
        });

        it('should return independent trunks without offsets if suggestedPorts are distinct', () => {
            // Forward peers on right, backward peers on left
            const fPeers = [{ x: 300, y: 100, width: 40, height: 40 }];
            const bPeers = [{ x: 0, y: 100, width: 40, height: 40 }];
            const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeers, bPeers, true, defaultConfig, 'LR');
            expect(result.forward?.suggestedPort).toBe('right');
            expect(result.backward?.suggestedPort).toBe('left');
            // Check that they are not pushed relative to each other (independent)
            expect(result.forward?.axis).toBeLessThan(300);
            expect(result.backward?.axis).toBeGreaterThan(40);
        });

        describe('collision offsets (same suggestedPort)', () => {
            // Both are on the right side (suggestedPort = 'right')
            const fPeers = [{ x: 300, y: 80, width: 20, height: 20 }];
            const bPeers = [{ x: 300, y: 150, width: 20, height: 20 }, { x: 300, y: 200, width: 20, height: 20 }];

            it('should assign base trunk to backward in count-based strategy if backward has more peers', () => {
                // backwardPeers.length (2) > forwardPeers.length (1)
                // backward uses base, forward is offset (pushed outward, i.e., further right since suggestedPort = 'right')
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeers, bPeers, true, defaultConfig, 'LR');
                expect(result.forward).toBeDefined();
                expect(result.backward).toBeDefined();
                // Backward uses base
                expect(result.forward?.axis).toBeGreaterThan(result.backward!.axis);
            });

            it('should assign base trunk to forward in count-based strategy if forward has more peers', () => {
                // forward (2 peers) > backward (1 peer)
                const fPeersMore = [...fPeers, { x: 300, y: 50, width: 20, height: 20 }];
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeersMore, bPeers.slice(0, 1), true, defaultConfig, 'LR');
                // Forward uses base, backward gets offset (pushed outward)
                expect(result.backward?.axis).toBeGreaterThan(result.forward!.axis);
            });

            it('should assign base trunk to forward in count-based strategy if counts are equal', () => {
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeers, bPeers.slice(0, 1), true, defaultConfig, 'LR');
                // Equal count: forwardPriority -> forward uses base, backward is offset (pushed outward)
                expect(result.backward?.axis).toBeGreaterThan(result.forward!.axis);
            });

            it('should apply backward-first strategy when specified in config', () => {
                const config: UnifiedRoutingConfig = {
                    ...defaultConfig,
                    bus: {
                        ...defaultConfig.bus,
                        parallelTrunkStrategy: 'backward-first'
                    }
                };
                // Even if forward has more peers, backward-first forces backward to get base trunk
                const fPeersMore = [...fPeers, { x: 300, y: 50, width: 20, height: 20 }];
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeersMore, bPeers.slice(0, 1), true, config, 'LR');
                expect(result.forward?.axis).toBeGreaterThan(result.backward!.axis);
            });

            it('should apply forward-first strategy as default fallback when strategy is unknown', () => {
                const config: UnifiedRoutingConfig = {
                    ...defaultConfig,
                    bus: {
                        ...defaultConfig.bus,
                        parallelTrunkStrategy: 'unknown-strategy' as any
                    }
                };
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeers, bPeers, true, config, 'LR');
                // Fallback to forwardUsesBase = true -> forward uses base, backward gets offset
                expect(result.backward?.axis).toBeGreaterThan(result.forward!.axis);
            });

            it('should offset outward to the left when suggestedPort is left', () => {
                // Peers on the left side
                const fPeersLeft = [{ x: 10, y: 80, width: 20, height: 20 }];
                const bPeersLeft = [{ x: 10, y: 150, width: 20, height: 20 }];
                // Equal count: forward priority (forward gets base, backward gets offset)
                // Since port is 'left', pushing outward means pushing left (so offset is negative)
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeersLeft, bPeersLeft, true, defaultConfig, 'LR');
                expect(result.backward?.axis).toBeLessThan(result.forward!.axis);
            });

            it('should offset outward to the top when suggestedPort is top', () => {
                // Peers on the top side
                const fPeersTop = [{ x: 130, y: 10, width: 20, height: 20 }];
                const bPeersTop = [{ x: 150, y: 10, width: 20, height: 20 }];
                // Equal count: forward priority
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeersTop, bPeersTop, true, defaultConfig, 'TB');
                expect(result.backward?.axis).toBeLessThan(result.forward!.axis);
            });

            it('should offset outward to the left when suggestedPort is left and forward gets offset', () => {
                // Peers on the left side
                const fPeersLeft = [{ x: 10, y: 80, width: 20, height: 20 }];
                const bPeersLeft = [
                    { x: 10, y: 150, width: 20, height: 20 },
                    { x: 10, y: 200, width: 20, height: 20 }
                ];
                // backward (2 peers) > forward (1 peer) -> forward is offset
                const result = trunkCalculator.calculateParallelTrunks(hubNode, fPeersLeft, bPeersLeft, true, defaultConfig, 'LR');
                expect(result.forward?.axis).toBeLessThan(result.backward!.axis);
            });
        });
    });
});
