const CONFIGURATION_ERROR_MARKERS = [
  "AI 设置",
  "Provider",
  "API Key",
  "选择一个模型",
] as const;

export const isMindMapAIConfigurationError = (error: unknown): boolean => {
  if (typeof error !== "string") return false;
  const message = error.trim();
  if (!message) return false;
  return CONFIGURATION_ERROR_MARKERS.some((marker) => message.includes(marker));
};
