"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOpenAIEnabled = exports.getAIConfig = void 0;
const getAIConfig = () => {
    return {
        openai: {
            apiKey: process.env.OPENAI_API_KEY || "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",
            model: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
            baseUrl: process.env.OPENAI_BASE_URL,
        },
    };
};
exports.getAIConfig = getAIConfig;
const isOpenAIEnabled = () => {
    const config = (0, exports.getAIConfig)();
    return !!config.openai.apiKey;
};
exports.isOpenAIEnabled = isOpenAIEnabled;
