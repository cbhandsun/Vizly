import type { Connection, Edge, Node } from '@xyflow/react';
import type {
    ConnectionValidationResult,
    DiagramConnectionPolicy,
    DiagramConnectionPortDefinition,
    DiagramConnectionPortDirection,
    DiagramConnectionRelationDefinition,
} from '../../../types/connection';

const MAX_CONNECTION_TOKEN_LENGTH = 128;
const MAX_CONNECTION_COLLECTION_LENGTH = 1000;

const asRecord = (value: unknown): Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

const hasControlCharacter = (value: string): boolean => (
    Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1F || codePoint === 0x7F;
    })
);

export const connectionToken = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (
        normalized.length === 0
        || normalized.length > MAX_CONNECTION_TOKEN_LENGTH
        || hasControlCharacter(normalized)
    ) {
        return '';
    }
    return normalized;
};

const tokenList = (value: unknown): readonly string[] | undefined => {
    if (!Array.isArray(value) || value.length > MAX_CONNECTION_COLLECTION_LENGTH) return undefined;
    const tokens = value.map(connectionToken).filter(Boolean);
    return tokens.length === value.length ? tokens : undefined;
};

const directionToken = (value: unknown): DiagramConnectionPortDirection | undefined => (
    value === 'source' || value === 'target' || value === 'both' ? value : undefined
);

const finiteCapacity = (value: unknown): number | undefined => {
    if (value === undefined) return undefined;
    return typeof value === 'number'
        && Number.isSafeInteger(value)
        && value >= 0
        && value <= MAX_CONNECTION_COLLECTION_LENGTH
        ? value
        : undefined;
};

const coercePortDefinition = (value: unknown): DiagramConnectionPortDefinition | null => {
    const record = asRecord(value);
    const id = connectionToken(record.id);
    if (!id) return null;
    const capacity = finiteCapacity(record.capacity);
    if (record.capacity !== undefined && capacity === undefined) return null;
    const accepts = tokenList(record.accepts);
    if (record.accepts !== undefined && !accepts) return null;
    const relations = tokenList(record.relations);
    if (record.relations !== undefined && !relations) return null;
    const direction = directionToken(record.direction);
    if (record.direction !== undefined && !direction) return null;

    return {
        id,
        ...(connectionToken(record.role) ? { role: connectionToken(record.role) } : {}),
        ...(direction ? { direction } : {}),
        ...(connectionToken(record.dataType) ? { dataType: connectionToken(record.dataType) } : {}),
        ...(connectionToken(record.group) ? { group: connectionToken(record.group) } : {}),
        ...(capacity !== undefined ? { capacity } : {}),
        ...(typeof record.required === 'boolean' ? { required: record.required } : {}),
        ...(accepts ? { accepts } : {}),
        ...(relations ? { relations } : {}),
    };
};

const coercePortDefinitions = (value: unknown): readonly DiagramConnectionPortDefinition[] => {
    if (!Array.isArray(value) || value.length > MAX_CONNECTION_COLLECTION_LENGTH) return [];
    const ports = value.map(coercePortDefinition);
    return ports.every(Boolean) ? ports as DiagramConnectionPortDefinition[] : [];
};

const coerceRelationDefinition = (value: unknown): DiagramConnectionRelationDefinition | null => {
    const record = asRecord(value);
    const key = connectionToken(record.key);
    if (!key) return null;
    const sourceRoles = tokenList(record.sourceRoles);
    const targetRoles = tokenList(record.targetRoles);
    const sourceDataTypes = tokenList(record.sourceDataTypes);
    const targetDataTypes = tokenList(record.targetDataTypes);
    if (
        (record.sourceRoles !== undefined && !sourceRoles)
        || (record.targetRoles !== undefined && !targetRoles)
        || (record.sourceDataTypes !== undefined && !sourceDataTypes)
        || (record.targetDataTypes !== undefined && !targetDataTypes)
    ) {
        return null;
    }
    return {
        key,
        ...(sourceRoles ? { sourceRoles } : {}),
        ...(targetRoles ? { targetRoles } : {}),
        ...(sourceDataTypes ? { sourceDataTypes } : {}),
        ...(targetDataTypes ? { targetDataTypes } : {}),
        ...(typeof record.allowSelfLoop === 'boolean' ? { allowSelfLoop: record.allowSelfLoop } : {}),
    };
};

const coerceRelationDefinitions = (
    policy: DiagramConnectionPolicy | undefined,
): readonly DiagramConnectionRelationDefinition[] => {
    const definitions = policy?.relationDefinitions;
    if (!Array.isArray(definitions) || definitions.length > MAX_CONNECTION_COLLECTION_LENGTH) return [];
    const coerced = definitions.map(coerceRelationDefinition);
    return coerced.every(Boolean) ? coerced as DiagramConnectionRelationDefinition[] : [];
};

export const getConnectionRelationKey = (connection: Connection | Edge): string => {
    const data = asRecord('data' in connection ? connection.data : undefined);
    return connectionToken(data.relationKey)
        || connectionToken(data.relationType)
        || connectionToken(data.edgeRelation)
        || connectionToken(data.kind)
        || connectionToken(data.edgeType);
};

export const connectionIdentityMatches = (
    edge: Edge,
    connection: Connection | Edge,
): boolean => (
    edge.source === connection.source
    && edge.target === connection.target
    && connectionToken(edge.sourceHandle) === connectionToken(connection.sourceHandle)
    && connectionToken(edge.targetHandle) === connectionToken(connection.targetHandle)
    && getConnectionRelationKey(edge) === getConnectionRelationKey(connection)
);

const connectionResult = (
    valid: boolean,
    code: ConnectionValidationResult['code'],
    message: string,
    details?: Readonly<Record<string, string>>,
): ConnectionValidationResult => ({
    valid,
    code,
    severity: valid ? 'warning' : 'error',
    message,
    ...(details ? { details } : {}),
});

const nodePolicyKeys = (node: Node): string[] => {
    const data = asRecord(node.data);
    return [
        connectionToken(node.type),
        connectionToken(data.type),
        connectionToken(data.nodeType),
        connectionToken(data.domainClass),
        '*',
    ].filter(Boolean);
};

const readNodePorts = (
    node: Node | undefined,
    policy: DiagramConnectionPolicy | undefined,
): readonly DiagramConnectionPortDefinition[] => {
    if (!node) return [];
    const ports = new Map<string, DiagramConnectionPortDefinition>();
    for (const port of coercePortDefinitions(asRecord(node.data).ports)) {
        ports.set(port.id, port);
    }
    const definitions = policy?.portDefinitions;
    if (definitions) {
        for (const key of nodePolicyKeys(node)) {
            for (const port of coercePortDefinitions(definitions[key])) {
                if (!ports.has(port.id)) ports.set(port.id, port);
            }
        }
    }
    return [...ports.values()];
};

const findPort = (
    ports: readonly DiagramConnectionPortDefinition[],
    handle: string,
): DiagramConnectionPortDefinition | undefined => (
    ports.find(port => port.id === handle)
);

const portAllowsDirection = (
    port: DiagramConnectionPortDefinition,
    direction: Exclude<DiagramConnectionPortDirection, 'both'>,
): boolean => (
    (port.direction ?? 'both') === 'both' || port.direction === direction
);

const includesToken = (tokens: readonly string[] | undefined, value: string | undefined): boolean => (
    Boolean(value && tokens?.includes(value))
);

const portsAreTypeCompatible = (
    sourcePort: DiagramConnectionPortDefinition | undefined,
    targetPort: DiagramConnectionPortDefinition | undefined,
): boolean => {
    if (!sourcePort?.dataType || !targetPort?.dataType) return true;
    return sourcePort.dataType === targetPort.dataType
        || includesToken(targetPort.accepts, sourcePort.dataType)
        || includesToken(sourcePort.accepts, targetPort.dataType);
};

const edgeCountForPort = (
    edges: readonly Edge[],
    side: 'source' | 'target',
    nodeId: string,
    handle: string,
): number => (
    edges.filter(edge => (
        side === 'source'
            ? edge.source === nodeId && connectionToken(edge.sourceHandle) === handle
            : edge.target === nodeId && connectionToken(edge.targetHandle) === handle
    )).length
);

export interface ValidateConnectionDetailedOptions {
    nodes: readonly Node[];
    edges: readonly Edge[];
    connection: Connection | Edge;
    connectionPolicy?: DiagramConnectionPolicy;
    maxSourceConnections?: number;
    maxTargetConnections?: number;
    pluginAccepted?: boolean;
    ignoredEdgeIds?: ReadonlySet<string>;
}

export const validateConnectionDetailed = ({
    nodes,
    edges,
    connection,
    connectionPolicy,
    maxSourceConnections,
    maxTargetConnections,
    pluginAccepted = true,
    ignoredEdgeIds,
}: ValidateConnectionDetailedOptions): ConnectionValidationResult => {
    if (!pluginAccepted) {
        return connectionResult(false, 'plugin-rejected', 'The active diagram plugin rejected this connection.');
    }

    const source = connectionToken(connection.source);
    const target = connectionToken(connection.target);
    if (!source || !target) {
        return connectionResult(false, 'missing-endpoint', 'Connection must include both source and target nodes.');
    }

    const sourceNode = nodes.find(node => node.id === source);
    const targetNode = nodes.find(node => node.id === target);
    if (!sourceNode) {
        return connectionResult(false, 'unknown-source-node', 'Connection source node does not exist.');
    }
    if (!targetNode) {
        return connectionResult(false, 'unknown-target-node', 'Connection target node does not exist.');
    }
    const sourceHandle = connectionToken(connection.sourceHandle);
    const targetHandle = connectionToken(connection.targetHandle);
    const relationKey = getConnectionRelationKey(connection);
    const visibleEdges = ignoredEdgeIds
        ? edges.filter(edge => !ignoredEdgeIds.has(edge.id))
        : edges;
    const relationDefinitions = coerceRelationDefinitions(connectionPolicy);
    const relationDefinition = relationKey
        ? relationDefinitions.find(definition => definition.key === relationKey)
        : undefined;
    if (relationKey && relationDefinitions.length > 0 && !relationDefinition) {
        return connectionResult(false, 'unknown-relation', `Unknown connection relation "${relationKey}".`, { relation: relationKey });
    }

    const allowSelfLoop = relationDefinition?.allowSelfLoop
        ?? connectionPolicy?.allowSelfLoop === true;
    if (!allowSelfLoop && source === target) {
        return connectionResult(false, 'self-loop-disabled', 'Self-loop connections are disabled for this diagram.');
    }

    if (visibleEdges.some(edge => connectionIdentityMatches(edge, connection))) {
        return connectionResult(false, 'duplicate-connection', 'An identical connection already exists.');
    }

    const sourceData = asRecord(sourceNode?.data);
    if (sourceData.shape === 'pill' && /end|stop|结束|终止/.test(String(sourceData.label || '').toLowerCase())) {
        return connectionResult(false, 'terminal-node-source', 'Terminal nodes cannot start outgoing connections.');
    }

    if (maxSourceConnections != null && sourceHandle) {
        const count = edgeCountForPort(visibleEdges, 'source', source, sourceHandle);
        if (count >= maxSourceConnections) {
            return connectionResult(false, 'source-handle-limit', 'Source handle reached its connection limit.');
        }
    }
    if (maxTargetConnections != null && targetHandle) {
        const count = edgeCountForPort(visibleEdges, 'target', target, targetHandle);
        if (count >= maxTargetConnections) {
            return connectionResult(false, 'target-handle-limit', 'Target handle reached its connection limit.');
        }
    }

    const sourcePorts = readNodePorts(sourceNode, connectionPolicy);
    const targetPorts = readNodePorts(targetNode, connectionPolicy);
    if (sourcePorts.length > 0 && !sourceHandle) {
        return connectionResult(false, 'missing-source-port', 'Source node requires a semantic source port.');
    }
    if (targetPorts.length > 0 && !targetHandle) {
        return connectionResult(false, 'missing-target-port', 'Target node requires a semantic target port.');
    }

    const sourcePort = sourceHandle ? findPort(sourcePorts, sourceHandle) : undefined;
    const targetPort = targetHandle ? findPort(targetPorts, targetHandle) : undefined;
    if (sourcePorts.length > 0 && sourceHandle && !sourcePort) {
        return connectionResult(false, 'unknown-source-port', `Unknown source port "${sourceHandle}".`, { port: sourceHandle });
    }
    if (targetPorts.length > 0 && targetHandle && !targetPort) {
        return connectionResult(false, 'unknown-target-port', `Unknown target port "${targetHandle}".`, { port: targetHandle });
    }
    if (sourcePort && !portAllowsDirection(sourcePort, 'source')) {
        return connectionResult(false, 'source-port-direction', `Port "${sourcePort.id}" cannot start connections.`, { port: sourcePort.id });
    }
    if (targetPort && !portAllowsDirection(targetPort, 'target')) {
        return connectionResult(false, 'target-port-direction', `Port "${targetPort.id}" cannot receive connections.`, { port: targetPort.id });
    }
    if (sourcePort?.capacity !== undefined && sourceHandle) {
        const count = edgeCountForPort(visibleEdges, 'source', source, sourceHandle);
        if (count >= sourcePort.capacity) {
            return connectionResult(false, 'source-port-capacity', `Source port "${sourcePort.id}" reached capacity.`, { port: sourcePort.id });
        }
    }
    if (targetPort?.capacity !== undefined && targetHandle) {
        const count = edgeCountForPort(visibleEdges, 'target', target, targetHandle);
        if (count >= targetPort.capacity) {
            return connectionResult(false, 'target-port-capacity', `Target port "${targetPort.id}" reached capacity.`, { port: targetPort.id });
        }
    }
    if (!portsAreTypeCompatible(sourcePort, targetPort)) {
        return connectionResult(false, 'port-type-incompatible', 'Source and target port data types are incompatible.');
    }
    if (relationKey && sourcePort?.relations && !sourcePort.relations.includes(relationKey)) {
        return connectionResult(false, 'source-port-relation', `Source port "${sourcePort.id}" does not allow relation "${relationKey}".`, { port: sourcePort.id, relation: relationKey });
    }
    if (relationKey && targetPort?.relations && !targetPort.relations.includes(relationKey)) {
        return connectionResult(false, 'target-port-relation', `Target port "${targetPort.id}" does not allow relation "${relationKey}".`, { port: targetPort.id, relation: relationKey });
    }

    if (relationDefinition) {
        if (relationDefinition.sourceRoles && !includesToken(relationDefinition.sourceRoles, sourcePort?.role)) {
            return connectionResult(false, 'relation-source-role', `Relation "${relationKey}" does not allow this source port role.`, { relation: relationKey });
        }
        if (relationDefinition.targetRoles && !includesToken(relationDefinition.targetRoles, targetPort?.role)) {
            return connectionResult(false, 'relation-target-role', `Relation "${relationKey}" does not allow this target port role.`, { relation: relationKey });
        }
        if (relationDefinition.sourceDataTypes && !includesToken(relationDefinition.sourceDataTypes, sourcePort?.dataType)) {
            return connectionResult(false, 'relation-source-type', `Relation "${relationKey}" does not allow this source data type.`, { relation: relationKey });
        }
        if (relationDefinition.targetDataTypes && !includesToken(relationDefinition.targetDataTypes, targetPort?.dataType)) {
            return connectionResult(false, 'relation-target-type', `Relation "${relationKey}" does not allow this target data type.`, { relation: relationKey });
        }
    }

    return connectionResult(true, 'valid', 'Connection is valid.');
};
