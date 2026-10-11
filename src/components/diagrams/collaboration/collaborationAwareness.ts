import type { Doc } from 'yjs';
import { Awareness } from 'y-protocols/awareness';

class OwnedPresenceAwareness extends Awareness {
  private ready = true;
  private pendingUpdate: unknown[] | undefined;
  private publishTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPublishedAt = -Infinity;

  override emit(name: string, args: unknown[]): void {
    // Awareness invokes emit in its constructor before derived fields exist.
    if (name === 'update' && !this.ready) return;
    // y-websocket otherwise sends remote presence back as if this socket owned it.
    // Keep change notifications for the UI, but publish only locally authored updates.
    if (name === 'update' && args[1] !== 'local') return;
    if (name === 'update') {
      // Presence is ephemeral: publish the newest state at most five times per
      // second. Removal remains immediate so departed users do not linger.
      if (this.getLocalState() === null || Date.now() - this.lastPublishedAt >= 200) {
        this.cancelPending();
        this.lastPublishedAt = Date.now();
      } else {
        this.pendingUpdate = args;
        this.publishTimer ??= setTimeout(() => {
          const pending = this.pendingUpdate;
          this.publishTimer = undefined;
          this.pendingUpdate = undefined;
          this.lastPublishedAt = Date.now();
          if (pending) super.emit('update', pending);
        }, 200 - (Date.now() - this.lastPublishedAt));
        return;
      }
    }
    super.emit(name, args);
  }

  private cancelPending(): void {
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.publishTimer = undefined;
    this.pendingUpdate = undefined;
  }

  override destroy(): void {
    this.cancelPending();
    super.destroy();
  }
}

export const createCollaborationAwareness = (doc: Doc): Awareness => new OwnedPresenceAwareness(doc);
