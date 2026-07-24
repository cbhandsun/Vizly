export interface MindMapAIProviderConfig {
  id: string;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  name?: string;
}

export interface MindMapAIConfig {
  activeModelKey: string;
  providers: MindMapAIProviderConfig[];
}

export interface MindMapAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
}

export interface MindMapAIChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export interface MindMapAIRuntime {
  loadConfig: () => Promise<MindMapAIConfig>;
  requestChatCompletionJson: (
    provider: MindMapAIProviderConfig,
    request: MindMapAIChatRequest,
  ) => Promise<MindMapAIChatResponse>;
  formatRequestError: (error: unknown, maxLength?: number) => Promise<string>;
}

let runtime: MindMapAIRuntime | undefined;

export const configureMindMapAIRuntime = (nextRuntime: MindMapAIRuntime): void => {
  runtime = nextRuntime;
};

export const getMindMapAIRuntime = (): MindMapAIRuntime => {
  if (!runtime) {
    throw new Error('Mind map AI runtime has not been configured by the application.');
  }
  return runtime;
};
