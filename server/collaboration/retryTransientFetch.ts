/** One retry for reads or a generation-fenced lease renewal within the caller's deadline. */
export async function retryTransientFetch(
  transport: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  let first: Response | undefined;
  try {
    first = await transport(input, { ...init, signal });
  } catch (error) {
    if (signal.aborted) throw error;
  }
  if (first && ![502, 503, 504].includes(first.status)) return first;
  await first?.body?.cancel().catch(() => {});
  signal.throwIfAborted();
  return transport(input, { ...init, signal });
}
