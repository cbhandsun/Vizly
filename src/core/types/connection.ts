export type DiagramConnectionPortDirection = 'source' | 'target' | 'both';

export interface DiagramConnectionPortDefinition {
  /** Stable handle/port id used by React Flow handles and persisted edges. */
  id: string;
  /** Domain role, for example input/output/control/success/failure. */
  role?: string;
  /** Whether this port may start edges, receive edges, or both. Defaults to both. */
  direction?: DiagramConnectionPortDirection;
  /** Optional data/control type carried by this port. */
  dataType?: string;
  /** Optional visual or semantic group. */
  group?: string;
  /** Maximum number of edges allowed on this port for the relevant direction. */
  capacity?: number;
  /** Reserved for later completeness checks; not enforced during drag validation. */
  required?: boolean;
  /** Accepted peer data types. Target accepts source data type; source accepts target data type. */
  accepts?: readonly string[];
  /** Allowed relation keys for edges touching this port. */
  relations?: readonly string[];
}

export interface DiagramConnectionRelationDefinition {
  /** Stable relation key stored on edge data as relationKey/relationType/kind/edgeType. */
  key: string;
  /** Restrict allowed source port roles for this relation. */
  sourceRoles?: readonly string[];
  /** Restrict allowed target port roles for this relation. */
  targetRoles?: readonly string[];
  /** Restrict allowed source port data types for this relation. */
  sourceDataTypes?: readonly string[];
  /** Restrict allowed target port data types for this relation. */
  targetDataTypes?: readonly string[];
  /** Per-relation self-loop override. */
  allowSelfLoop?: boolean;
}

export interface DiagramConnectionPolicy {
  /** Allows source and target to be the same node for diagrams that model loops. */
  allowSelfLoop?: boolean;
  /**
   * Semantic ports by node type/domain key. Keys are matched against node.type,
   * data.type, data.nodeType, data.domainClass, and '*'.
   */
  portDefinitions?: Readonly<Record<string, readonly DiagramConnectionPortDefinition[]>>;
  /** Domain edge relation contracts keyed by relation key. */
  relationDefinitions?: readonly DiagramConnectionRelationDefinition[];
}

export type ConnectionValidationSeverity = 'error' | 'warning';

export type ConnectionValidationCode =
  | 'valid'
  | 'plugin-rejected'
  | 'missing-endpoint'
  | 'unknown-source-node'
  | 'unknown-target-node'
  | 'self-loop-disabled'
  | 'duplicate-connection'
  | 'terminal-node-source'
  | 'source-handle-limit'
  | 'target-handle-limit'
  | 'missing-source-port'
  | 'missing-target-port'
  | 'unknown-source-port'
  | 'unknown-target-port'
  | 'source-port-direction'
  | 'target-port-direction'
  | 'source-port-capacity'
  | 'target-port-capacity'
  | 'port-type-incompatible'
  | 'source-port-relation'
  | 'target-port-relation'
  | 'unknown-relation'
  | 'relation-source-role'
  | 'relation-target-role'
  | 'relation-source-type'
  | 'relation-target-type';

export interface ConnectionValidationResult {
  valid: boolean;
  code: ConnectionValidationCode;
  severity: ConnectionValidationSeverity;
  message: string;
  /** Sanitized message interpolation data for localized user-facing feedback. */
  details?: Readonly<Record<string, string>>;
}
