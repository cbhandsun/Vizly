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
     * 初始化协同会话
     */
    init(diagramId: string, user?: { id: string; name: string }) {
        if (this.doc) this.destroy();

        this.doc = new Y.Doc();
        this.userId = user?.id || `anon-${Math.random().toString(36).slice(2, 9)}`;
        this.userName = user?.name || `用户 ${this.userId.slice(-4)}`;
        this.userColor = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];

        // 连接到协作服务器 (如果配置)
        const roomName = `vizly-room-${diagramId}`;
        const wsUrl = import.meta.env.VITE_YJS_WS_URL as string | undefined;
        
        if (wsUrl) {
            this.provider = new WebsocketProvider(wsUrl, roomName, this.doc);
            
            // 设置本地状态
            this.provider.awareness.setLocalStateField('user', {
                name: this.userName,
                color: this.userColor,
                id: this.userId
            });

            console.log(`[Collab] Connected to room: ${roomName} as ${this.userName}`);
        } else {
            console.log(`[Collab] Collaboration is local-only (No VITE_YJS_WS_URL provided). Room: ${roomName}`);
        }
    }

    getDoc() {
        if (!this.doc) throw new Error('CollaborationService not initialized');
        return this.doc;
    }

    getProvider() {
        if (!this.provider) throw new Error('CollaborationService not initialized');
        return this.provider;
    }

    getAwareness() {
        return this.getProvider().awareness;
    }

    getLocalUser(): CollaborationUser {
        return {
            id: this.userId,
            name: this.userName,
            color: this.userColor
        };
    }

    isInitialized() {
        return !!this.provider && !!this.doc;
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
    }
}

export const collaborationService = new CollaborationService();
