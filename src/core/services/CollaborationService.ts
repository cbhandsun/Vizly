import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CollaborationUser {
    id: string;
    name: string;
    color: string;
    avatar?: string;
    cursor?: { x: number; y: number };
}

const COLLAB_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

class CollaborationService {
    private doc: Y.Doc | null = null;
    private provider: WebsocketProvider | null = null;
    private userId: string = '';
    private userName: string = '';
    private userColor: string = '';

    /**
     * 初始化协同会话。
     * 若未配置 VITE_YJS_WS_URL 环境变量，则以离线（local-only）模式运行：
     * 仍然创建 Y.Doc，但不建立 WebSocket 连接。
     */
    init(diagramId: string, user?: { id: string; name: string }) {
        if (this.doc) this.destroy();

        this.doc = new Y.Doc();
        this.userId = user?.id || `anon-${Math.random().toString(36).slice(2, 9)}`;
        this.userName = user?.name || `用户 ${this.userId.slice(-4)}`;
        this.userColor = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];

        const roomName = `vizly-room-${diagramId}`;
        const wsUrl = import.meta.env.VITE_YJS_WS_URL as string | undefined;

        if (wsUrl) {
            this.provider = new WebsocketProvider(wsUrl, roomName, this.doc);

            // 设置本地 Presence 状态
            this.provider.awareness.setLocalStateField('user', {
                name: this.userName,
                color: this.userColor,
                id: this.userId,
            });
        }
        // If no wsUrl, remain in offline/local-only mode (provider stays null).
    }

    getDoc(): Y.Doc {
        if (!this.doc) throw new Error('[CollaborationService] not initialized — call init() first');
        return this.doc;
    }

    /**
     * Returns the WebsocketProvider, or throws if collaboration is offline.
     * Prefer `getProviderSafe()` when callers may run without a WS connection.
     */
    getProvider(): WebsocketProvider {
        if (!this.provider) throw new Error('[CollaborationService] provider is unavailable (no VITE_YJS_WS_URL or not initialized)');
        return this.provider;
    }

    /**
     * [Safe variant] Returns the WebsocketProvider, or null if not connected.
     * Use this in all UI components to avoid crashes in offline/local mode.
     */
    getProviderSafe(): WebsocketProvider | null {
        return this.provider;
    }

    /**
     * Returns the Awareness instance, or null if not connected.
     * Use this in place of `getAwareness()` in components that render in offline mode.
     */
    getAwarenessSafe() {
        return this.provider?.awareness ?? null;
    }

    /**
     * @deprecated Prefer getAwarenessSafe() — this throws when provider is null.
     */
    getAwareness() {
        return this.getProvider().awareness;
    }

    getLocalUser(): CollaborationUser {
        return {
            id: this.userId,
            name: this.userName,
            color: this.userColor,
        };
    }

    /**
     * True only when a live WebSocket connection has been established.
     * Returns false in local-only (offline) mode.
     */
    isConnected(): boolean {
        return !!this.provider && !!this.doc;
    }

    /**
     * True when init() has been called (regardless of WS connectivity).
     * Use this to determine whether Y.Doc is available.
     */
    isInitialized(): boolean {
        return !!this.doc;
    }

    destroy() {
        if (this.provider) {
            this.provider.destroy();
            this.provider = null;
        }
        if (this.doc) {
            this.doc.destroy();
            this.doc = null;
        }
        this.userId = '';
        this.userName = '';
        this.userColor = '';
    }
}

export const collaborationService = new CollaborationService();
