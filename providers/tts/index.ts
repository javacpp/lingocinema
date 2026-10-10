import { TTSProvider } from './interface.js';
import { GeminiTTSProvider } from './gemini.js';
import { OpenAITTSProvider } from './openai.js';
import { PiperTTSProvider } from './piper.js';

export function createTTSProvider(config: {
  provider: string;
  geminiApiKey?: string;
  geminiTtsModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiTtsModel?: string;
  openaiTtsVoice?: string;
  piperBinaryPath?: string;
  piperModelPath?: string;
}): TTSProvider {
  switch (config.provider) {
    case "gemini":
      if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required");
      return new GeminiTTSProvider(config.geminiApiKey, config.geminiTtsModel);
    case "openai":
      return new OpenAITTSProvider(
        config.openaiApiKey || "",
        config.openaiBaseUrl || "https://api.openai.com",
        config.openaiTtsModel || "tts-1",
        config.openaiTtsVoice || "alloy",
      );
    case "piper":
      return new PiperTTSProvider(
        config.piperBinaryPath || "piper",
        config.piperModelPath || "",
      );
    default:
      throw new Error(`Unknown TTS provider: ${config.provider}`);
  }
}
