const OPEN_MIND_MAP_AI_CONFIG_EVENT = "vizly:open-mind-map-ai-config";

export const requestMindMapAIConfig = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_MIND_MAP_AI_CONFIG_EVENT));
};

export const subscribeMindMapAIConfigRequest = (
  listener: () => void,
): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(OPEN_MIND_MAP_AI_CONFIG_EVENT, listener);
  return () =>
    window.removeEventListener(OPEN_MIND_MAP_AI_CONFIG_EVENT, listener);
};
