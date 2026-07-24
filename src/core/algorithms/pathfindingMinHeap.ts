export class MinHeap {
    // [I-6] Use Int32Array instead of number[] to eliminate per-push GC allocations.
    // The heap stores grid indices (Int32), not floating-point values.
    // Initial capacity = min(maxIndex, 65536) balances pre-allocation cost vs. coverage:
    //   - A typical 100×100 grid (10K cells) easily fits in 65536 slots.
    //   - For a 2M-cell grid, 65536 is still generous (open set peaks at sqrt(N) ~ 1414).
    // Growth: capacity doubles on overflow (rare, only on pathologically dense graphs).
    private heap: Int32Array;
    private capacity: number;
    private _size: number = 0;
    private weights: Float32Array;

    constructor(weights: Float32Array) {
        this.weights = weights;
        this.capacity = Math.min(weights.length, 65536);
        this.heap = new Int32Array(this.capacity);
    }

    push(index: number) {
        if (this._size >= this.capacity) {
            // Grow: double capacity (rare path)
            const newCapacity = Math.min(this.capacity * 2, this.weights.length);
            const newHeap = new Int32Array(newCapacity);
            newHeap.set(this.heap.subarray(0, this._size));
            this.heap = newHeap;
            this.capacity = newCapacity;
        }
        this.heap[this._size] = index;
        this.bubbleUp(this._size++);
    }

    pop(): number | undefined {
        if (this._size === 0) return undefined;
        const top = this.heap[0];
        this._size--;
        if (this._size > 0) {
            this.heap[0] = this.heap[this._size];
            this.bubbleDown(0);
        }
        return top;
    }

    size(): number {
        return this._size;
    }

    private bubbleUp(i: number) {
        while (i > 0) {
            const p = (i - 1) >>> 1;
            if (this.weights[this.heap[i]] < this.weights[this.heap[p]]) {
                this.swap(i, p);
                i = p;
            } else {
                break;
            }
        }
    }

    private bubbleDown(i: number) {
        // [I-6] Use this._size (not heap.length) to avoid comparing uninitialized slots
        const len = this._size;
        while (i >= 0) {
            const l = (i << 1) + 1;
            const r = l + 1;
            let smallest = i;

            if (l < len && this.weights[this.heap[l]] < this.weights[this.heap[smallest]]) {
                smallest = l;
            }
            if (r < len && this.weights[this.heap[r]] < this.weights[this.heap[smallest]]) {
                smallest = r;
            }
            if (smallest !== i) {
                this.swap(i, smallest);
                i = smallest;
            } else {
                break;
            }
        }
    }

    private swap(a: number, b: number) {
        const tmp = this.heap[a];
        this.heap[a] = this.heap[b];
        this.heap[b] = tmp;
    }
}
