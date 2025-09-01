import OpenAI from 'openai';
import { getAIConfig } from '../../config/ai-config';

const config = getAIConfig();
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

const MODEL_NAME = config.openai.model;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callLLM(
  messages: LLMMessage[],
  temperature: number = 0.2,
  responseFormat: 'text' | 'json' = 'text'
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: messages as any,
      temperature,
      max_tokens: 16384,
      ...(responseFormat === 'json' && {
        response_format: { type: "json_object" }
      })
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from LLM');
    }

    return response;
  } catch (error) {
    console.error('LLM call failed:', error);
    throw new Error(`LLM call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
