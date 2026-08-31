/**
 * Memoizes evidence derived from an immutable request-local object reference.
 * Values are wrapped so `null` and `undefined` remain valid computed results.
 */
export const createBaseReactFlowRequestMemo = <Input extends object, Result>(
  compute: (input: Input) => Result,
): ((input: Input) => Result) => {
  const values = new WeakMap<Input, Readonly<{ value: Result }>>();
  return (input) => {
    const cached = values.get(input);
    if (cached) return cached.value;
    const value = compute(input);
    values.set(input, { value });
    return value;
  };
};
