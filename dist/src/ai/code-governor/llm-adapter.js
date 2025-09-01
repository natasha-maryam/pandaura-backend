"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callLLM = callLLM;
const openai_1 = __importDefault(require("openai"));
const ai_config_1 = require("../../config/ai-config");
const config = (0, ai_config_1.getAIConfig)();
const openai = new openai_1.default({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
});
const MODEL_NAME = config.openai.model;
async function callLLM(messages, temperature = 0.2, responseFormat = 'text') {
    try {
        const completion = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: messages,
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
    }
    catch (error) {
        console.error('LLM call failed:', error);
        throw new Error(`LLM call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
