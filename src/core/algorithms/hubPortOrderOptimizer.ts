export interface HubPortOrderItem<T> {
    item: T;
    id: string;
    branchCoord: number;
    peerCoord: number;
    secondaryCoord?: number;
}

export interface HubPortOrderOptions {
    maxPasses?: number;
    primaryWeight?: number;
    secondaryWeight?: number;
    branchOrderWeight?: number;
}

/**
 * Greedy adjacent-swap ordering for edges that enter or leave the same hub side.
 *
 * In a Manhattan drawing, avoidable branch crossings usually come from a mismatch
 * between the order of branch junctions on the trunk and the spatial order of the
 * peer nodes. This keeps the common "sort by barycenter" baseline, then performs
 * a tiny greedy-switch pass like layered-layout crossing minimizers do.
 */
export function optimizeHubPortOrder<T>(
    items: Array<HubPortOrderItem<T>>,
    options: HubPortOrderOptions = {}
): T[] {
    if (items.length <= 2) {
        return [...items]
            .sort((a, b) => a.branchCoord - b.branchCoord || a.peerCoord - b.peerCoord || a.id.localeCompare(b.id))
            .map(entry => entry.item);
    }

    const primaryWeight = options.primaryWeight ?? 10;
    const secondaryWeight = options.secondaryWeight ?? 1;
    const branchOrderWeight = options.branchOrderWeight ?? 6;
    const maxPasses = options.maxPasses ?? 3;

    const ordered = [...items].sort((a, b) =>
        a.branchCoord - b.branchCoord
        || a.peerCoord - b.peerCoord
        || (a.secondaryCoord ?? 0) - (b.secondaryCoord ?? 0)
        || a.id.localeCompare(b.id)
    );

    let currentScore = scoreOrder(ordered, primaryWeight, secondaryWeight, branchOrderWeight);
    for (let pass = 0; pass < maxPasses; pass++) {
        let changed = false;

        for (let i = 0; i < ordered.length - 1; i++) {
            swap(ordered, i, i + 1);
            const nextScore = scoreOrder(ordered, primaryWeight, secondaryWeight, branchOrderWeight);
            if (nextScore < currentScore) {
                currentScore = nextScore;
                changed = true;
            } else {
                swap(ordered, i, i + 1);
            }
        }

        if (!changed) break;
    }

    return ordered.map(entry => entry.item);
}

function scoreOrder<T>(
    ordered: Array<HubPortOrderItem<T>>,
    primaryWeight: number,
    secondaryWeight: number,
    branchOrderWeight: number
): number {
    let score = 0;
    for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
            const a = ordered[i];
            const b = ordered[j];
            if (a.peerCoord > b.peerCoord + 1) score += primaryWeight;
            if ((a.secondaryCoord ?? 0) > (b.secondaryCoord ?? 0) + 1) score += secondaryWeight;
            if (a.branchCoord > b.branchCoord + 1) score += branchOrderWeight;
        }
    }
    return score;
}

function swap<T>(arr: T[], i: number, j: number): void {
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
}
