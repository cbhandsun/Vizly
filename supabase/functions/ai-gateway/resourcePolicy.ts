/** Server-owned limits. Request bodies cannot override resource policy. */
export const DEFAULT_GATEWAY_OUTPUT_TOKENS = 16_384;
export const parseGatewayOutputTokenLimit = (value: unknown): number => {
  if (value === undefined) return DEFAULT_GATEWAY_OUTPUT_TOKENS;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,4}$/.test(value)
    || Number(value) > 65_536) throw new Error('Invalid gateway output token limit');
  return Number(value);
};
