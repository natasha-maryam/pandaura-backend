export interface AIConfig {
  openai: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
}

export const getAIConfig = (): AIConfig => {
  return {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "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",
      model: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
      baseUrl: process.env.OPENAI_BASE_URL,
    },
  };
};

export const isOpenAIEnabled = (): boolean => {
  const config = getAIConfig();
  return !!config.openai.apiKey;
};
