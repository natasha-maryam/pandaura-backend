"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOpenAIEnabled = exports.getAIConfig = void 0;
require('dotenv').config();
const getAIConfig = () => {
    // console.log('Environment check:');
    // console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
    // console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);
    // console.log('OPENAI_API_KEY starts with:', process.env.OPENAI_API_KEY?.substring(0, 10) || 'undefined');
    return {
        openai: {
            apiKey: process.env.OPENAI_API_KEY || "",
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
