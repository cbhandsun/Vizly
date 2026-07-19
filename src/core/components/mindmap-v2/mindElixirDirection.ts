export type MindElixirDirection = 0 | 1 | 2;

export const DEFAULT_MIND_ELIXIR_DIRECTION: MindElixirDirection = 2;

export const coerceMindElixirDirection = (
    value: unknown,
    fallback: MindElixirDirection = DEFAULT_MIND_ELIXIR_DIRECTION,
): MindElixirDirection => {
    if (value === 0 || value === 1 || value === 2) return value;
    // Legacy Vizly data used 3 for "left"; mind-elixir's LEFT constant is 0.
    if (value === 3) return 0;
    return fallback;
};
