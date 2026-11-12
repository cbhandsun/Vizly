import type { DiagramVersion, VersionSaveFailure } from './storage/types';
import { failedVersionOutboxTask, type VersionOutboxTask } from './versionOutbox';

export interface VersionOutboxScope { ownerId: string; key: string }
export interface VersionOutboxRunnerDependencies {
    scope(): VersionOutboxScope | null;
    list(ownerId: string): Promise<VersionOutboxTask[]>;
    load(task: VersionOutboxTask): Promise<DiagramVersion | null>;
    upload(task: VersionOutboxTask, version: DiagramVersion, signal: AbortSignal): Promise<DiagramVersion>;
    complete(task: VersionOutboxTask, remote: DiagramVersion): Promise<void>;
    fail(task: VersionOutboxTask, next: VersionOutboxTask): Promise<void>;
    classify(error: unknown): VersionSaveFailure;
    changed(): void;
}

const boundedUpload = async (
    operation: (signal: AbortSignal) => Promise<DiagramVersion>, parent: AbortSignal,
): Promise<DiagramVersion> => {
    const controller = new AbortController();
    const cancel = () => controller.abort(new DOMException('Synchronization cancelled', 'AbortError'));
    parent.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error('Version upload timeout')), 15_000);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
        if (parent.aborted) cancel();
        return await Promise.race([aborted, controller.signal.aborted ? aborted : operation(controller.signal)]);
    } finally {
        clearTimeout(timeout);
        parent.removeEventListener('abort', cancel);
        controller.signal.removeEventListener('abort', onAbort);
    }
};

/** One flight per runtime; immutable remote IDs make retries across tabs safe. */
export class VersionOutboxRunner {
    private timer: ReturnType<typeof setTimeout> | undefined;
    private active: AbortController | undefined;
    private running = false;
    private stopped = false;
    private requested = false;
    constructor(private readonly dependencies: VersionOutboxRunnerDependencies) {}

    wake = (): void => {
        if (this.stopped) return;
        if (this.running) { this.requested = true; return; }
        this.schedule(0);
    };

    invalidate = (): void => { this.active?.abort(); this.wake(); };

    stop = (): void => {
        this.stopped = true;
        clearTimeout(this.timer);
        this.active?.abort();
    };

    private schedule(delay: number): void {
        if (this.stopped) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.run(); }, delay);
    }

    private async run(): Promise<void> {
        if (this.running || this.stopped) return;
        const scope = this.dependencies.scope();
        if (!scope) return;
        this.running = true;
        const controller = new AbortController();
        this.active = controller;
        const current = () => !this.stopped && !controller.signal.aborted
            && this.dependencies.scope()?.key === scope.key;
        let nextDelay: number | undefined;
        try {
            const tasks = await this.dependencies.list(scope.ownerId);
            let processed = 0;
            for (const task of tasks) {
                if (!current()) break;
                if (task.ownerId !== scope.ownerId || task.provider !== 'supabase' || task.status !== 'pending') continue;
                const delay = task.nextAttemptAt - Date.now();
                if (delay > 0) { nextDelay = Math.min(nextDelay ?? delay, delay); continue; }
                if (processed++ >= 16) { nextDelay = 0; break; }
                try {
                    const version = await this.dependencies.load(task);
                    if (!current()) break;
                    if (!version?.snapshotData || version.storage?.ownerId !== scope.ownerId
                        || version.storage.provider !== 'supabase' || !version.storage.localCreated
                        || version.diagramId !== task.diagramId || version.id !== task.versionId)
                        throw new Error('Invalid outbox snapshot');
                    const remote = await boundedUpload(signal => this.dependencies.upload(task, version, signal), controller.signal);
                    if (!current()) break;
                    await this.dependencies.complete(task, remote);
                    if (current()) this.dependencies.changed();
                } catch (error) {
                    if (!current()) break;
                    const next = failedVersionOutboxTask(task, this.dependencies.classify(error), Date.now());
                    await this.dependencies.fail(task, next);
                    if (current()) this.dependencies.changed();
                    if (next.status === 'pending') nextDelay = Math.min(nextDelay ?? Infinity, next.nextAttemptAt - Date.now());
                }
            }
        } catch {
            // Database failures never discard tasks and never spin in an immediate loop.
            nextDelay = 30_000;
        } finally {
            this.running = false;
            this.active = undefined;
            if (this.requested) { this.requested = false; this.wake(); }
            else if (current() && nextDelay !== undefined) this.schedule(Math.max(0, nextDelay));
        }
    }
}
