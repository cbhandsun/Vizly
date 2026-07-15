export type TypeScriptDiagnosticCategory = 'error' | 'warning';

export interface ParsedTypeScriptDiagnostic {
  category: TypeScriptDiagnosticCategory;
  file: string | null;
  line: number | null;
  column: number | null;
  code: number;
  messageHash: string;
}

export interface TypeScriptDiagnosticSummary {
  category: TypeScriptDiagnosticCategory;
  file: string | null;
  code: number;
  messageHash: string;
  count: number;
}

export interface TypecheckDiagnosticBaseline {
  schemaVersion: number;
  projects: Record<string, TypeScriptDiagnosticSummary[]>;
}

export interface TypecheckDiagnosticDifference extends TypeScriptDiagnosticSummary {
  projectName: string;
  baselineCount: number;
  currentCount: number;
  delta: number;
}

export const TYPECHECK_BASELINE_SCHEMA_VERSION: number;
export const MAX_COMPILER_OUTPUT_BYTES: number;
export const MAX_DIAGNOSTIC_COUNT: number;
export const MAX_BASELINE_JSON_CHARS: number;

export function parseTypeScriptDiagnostics(
  output: string,
  options?: {
    projectRoot?: string;
    maxOutputChars?: number;
    maxDiagnosticCount?: number;
  },
): {
  diagnostics: ParsedTypeScriptDiagnostic[];
  unparsedPreamble: string[];
};

export function summarizeDiagnostics(
  diagnostics: ParsedTypeScriptDiagnostic[],
): TypeScriptDiagnosticSummary[];

export function interpretCompilerResult(
  result: {
    status: number | null;
    signal?: string | null;
    stdout?: string;
    stderr?: string;
    error?: { code?: string } | null;
  },
  options?: {
    projectName?: string;
    projectRoot?: string;
    maxOutputChars?: number;
  },
): ParsedTypeScriptDiagnostic[];

export function validateTypecheckBaseline(
  baseline: unknown,
  expectedProjectNames?: string[],
): TypecheckDiagnosticBaseline;

export function parseTypecheckBaselineJson(
  serialized: string,
  expectedProjectNames: string[],
  options?: { maxJsonChars?: number },
): TypecheckDiagnosticBaseline;

export function parseTypecheckTimeoutMs(raw: string | undefined): number;

export function parseTypecheckArguments(args: string[]): { writeBaseline: boolean };

export function createTypecheckBaseline(
  projectDiagnostics: Record<string, ParsedTypeScriptDiagnostic[]>,
): TypecheckDiagnosticBaseline;

export function compareTypecheckBaseline(
  baseline: TypecheckDiagnosticBaseline,
  projectDiagnostics: Record<string, ParsedTypeScriptDiagnostic[]>,
  expectedProjectNames: string[],
): {
  additions: TypecheckDiagnosticDifference[];
  removals: TypecheckDiagnosticDifference[];
  current: TypecheckDiagnosticBaseline;
};
