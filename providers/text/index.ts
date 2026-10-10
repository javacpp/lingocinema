import { TextProvider } from './interface.js';
import { GeminiTextProvider } from './gemini.js';
import { OpenAICompatibleTextProvider } from './openai.js';

export function createTextProvider(config: {
  provider: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiThinkingLevel?: string;
  geminiMaxOutputTokens?: number;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  llamacppBaseUrl?: string;
  llamacppModel?: string;
}): TextProvider {
  switch (config.provider) {
    case "gemini":
      if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required for Gemini provider");
      return new GeminiTextProvider(config.geminiApiKey, config.geminiModel, config.geminiThinkingLevel, config.geminiMaxOutputTokens);

    case "openai":
      return new OpenAICompatibleTextProvider(
        "openai",
        config.openaiBaseUrl || "https://api.openai.com",
        config.openaiModel || "gpt-4o",
        config.openaiApiKey || "",
      );

    case "ollama":
      return new OpenAICompatibleTextProvider(
        "ollama",
        config.ollamaBaseUrl || "http://localhost:11434",
        config.ollamaModel || "llama3",
        "", 
      );

    case "llamacpp":
      return new OpenAICompatibleTextProvider(
        "llamacpp",
        config.llamacppBaseUrl || "http://localhost:8080",
        config.llamacppModel || "default",
        "", 
      );

    default:
      throw new Error(`Unknown text provider: ${config.provider}`);
  }
}
