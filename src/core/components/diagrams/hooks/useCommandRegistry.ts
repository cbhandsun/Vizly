import { useState, useCallback } from 'react';

export interface Command {
    id: string;
    label: string;
    category: 'General' | 'Nodes' | 'Edges' | 'View' | 'Action' | 'File';
    shortcut?: string;
    keywords?: string[];
    icon?: React.ReactNode;
    action: () => void;
    enabled?: boolean;
}

export const useCommandRegistry = () => {
    const [commands, setCommands] = useState<Command[]>([]);

    const registerCommand = useCallback((command: Command) => {
        setCommands(prev => {
            const index = prev.findIndex(c => c.id === command.id);
            if (index < 0) return [...prev, command];
            const next = [...prev];
            next[index] = { ...next[index], ...command };
            return next;
        });
    }, []);

    const unregisterCommand = useCallback((id: string) => {
        setCommands(prev => prev.filter(c => c.id !== id));
    }, []);

    const registerCommands = useCallback((cmds: Command[]) => {
        setCommands(prev => {
            if (cmds.length === 0) return prev;

            const byId = new Map(prev.map(c => [c.id, c] as const));
            let changed = false;
            const next = [...prev];

            for (const cmd of cmds) {
                const existing = byId.get(cmd.id);
                if (existing) {
                    // 浅比较可序列化字段，跳过 action/icon（函数/ReactNode 引用总是变）
                    const same = existing.label === cmd.label
                        && existing.category === cmd.category
                        && existing.shortcut === cmd.shortcut
                        && existing.enabled === cmd.enabled;
                    if (!same) {
                        const idx = next.findIndex(x => x.id === cmd.id);
                        if (idx >= 0) next[idx] = { ...existing, ...cmd };
                        byId.set(cmd.id, { ...existing, ...cmd });
                        changed = true;
                    } else {
                        // 静默更新 action/icon 引用，不触发重渲染
                        const idx = next.findIndex(x => x.id === cmd.id);
                        if (idx >= 0) {
                            next[idx] = { ...existing, action: cmd.action, icon: cmd.icon };
                        }
                    }
                } else {
                    next.push(cmd);
                    byId.set(cmd.id, cmd);
                    changed = true;
                }
            }

            return changed ? next : prev;
        });
    }, []);

    const getFilteredCommands = useCallback((query: string) => {
        if (!query) return commands;
        const lowerQuery = query.toLowerCase();

        // Simple scoring
        return commands
            .filter(cmd =>
                (cmd.enabled !== false) &&
                (cmd.label.toLowerCase().includes(lowerQuery) ||
                    cmd.category.toLowerCase().includes(lowerQuery) ||
                    cmd.keywords?.some(k => k.toLowerCase().includes(lowerQuery)))
            )
            .sort((a, b) => {
                // Exact match first
                const aLabel = a.label.toLowerCase();
                const bLabel = b.label.toLowerCase();

                if (aLabel === lowerQuery && bLabel !== lowerQuery) return -1;
                if (bLabel === lowerQuery && aLabel !== lowerQuery) return 1;

                // Starts with query second
                if (aLabel.startsWith(lowerQuery) && !bLabel.startsWith(lowerQuery)) return -1;
                if (bLabel.startsWith(lowerQuery) && !aLabel.startsWith(lowerQuery)) return 1;

                return 0;
            });
    }, [commands]);

    return {
        commands,
        registerCommand,
        unregisterCommand,
        registerCommands,
        getFilteredCommands
    };
};
