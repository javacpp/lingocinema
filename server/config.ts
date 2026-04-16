import dotenv from "dotenv";
import { createTextProvider, type TextProvider } from "./providers/text-provider.js";
import { createTTSProvider, type TTSProvider } from "./providers/tts-provider.js";

dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env

// ─── Configuration Types ────────────────────────────────────────────────

export interface AppConfig {
  // Active providers
  textProvider: string;
  ttsProvider: string;

  // Gemini
  geminiApiKey: string;
  geminiTextModel: string;
  geminiTtsModel: string;

  // OpenAI
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiTextModel: string;
  openaiTtsModel: string;
  openaiTtsVoice: string;

  // Ollama
  ollamaBaseUrl: string;
  ollamaTextModel: string;

  // llama.cpp
  llamacppBaseUrl: string;
  llamacppTextModel: string;

  // Piper TTS
  piperBinaryPath: string;
  piperModelPath: string;
}

// ─── Load from environment ──────────────────────────────────────────────

export function loadConfig(): AppConfig {
  return {
    textProvider: process.env.TEXT_PROVIDER || "gemini",
    ttsProvider: process.env.TTS_PROVIDER || "gemini",

    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiTextModel: process.env.GEMINI_TEXT_MODEL || "gemini-3-flash-preview",
    geminiTtsModel: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",

    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com",
    openaiTextModel: process.env.OPENAI_TEXT_MODEL || "gpt-4o",
    openaiTtsModel: process.env.OPENAI_TTS_MODEL || "tts-1",
    openaiTtsVoice: process.env.OPENAI_TTS_VOICE || "alloy",

    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    ollamaTextModel: process.env.OLLAMA_TEXT_MODEL || "llama3",

    llamacppBaseUrl: process.env.LLAMACPP_BASE_URL || "http://localhost:8080",
    llamacppTextModel: process.env.LLAMACPP_TEXT_MODEL || "default",

    piperBinaryPath: process.env.PIPER_BINARY_PATH || "piper",
    piperModelPath: process.env.PIPER_MODEL_PATH || "",
  };
}

// ─── Runtime State ──────────────────────────────────────────────────────

let currentConfig: AppConfig = loadConfig();
let textProviderInstance: TextProvider | null = null;
let ttsProviderInstance: TTSProvider | null = null;

function buildTextProvider(): TextProvider {
  return createTextProvider({
    provider: currentConfig.textProvider,
    geminiApiKey: currentConfig.geminiApiKey,
    geminiModel: currentConfig.geminiTextModel,
    openaiApiKey: currentConfig.openaiApiKey,
    openaiBaseUrl: currentConfig.openaiBaseUrl,
    openaiModel: currentConfig.openaiTextModel,
    ollamaBaseUrl: currentConfig.ollamaBaseUrl,
    ollamaModel: currentConfig.ollamaTextModel,
    llamacppBaseUrl: currentConfig.llamacppBaseUrl,
    llamacppModel: currentConfig.llamacppTextModel,
  });
}

function buildTTSProvider(): TTSProvider {
  return createTTSProvider({
    provider: currentConfig.ttsProvider,
    geminiApiKey: currentConfig.geminiApiKey,
    geminiTtsModel: currentConfig.geminiTtsModel,
    openaiApiKey: currentConfig.openaiApiKey,
    openaiBaseUrl: currentConfig.openaiBaseUrl,
    openaiTtsModel: currentConfig.openaiTtsModel,
    openaiTtsVoice: currentConfig.openaiTtsVoice,
    piperBinaryPath: currentConfig.piperBinaryPath,
    piperModelPath: currentConfig.piperModelPath,
  });
}

export function getTextProvider(): TextProvider {
  if (!textProviderInstance) {
    textProviderInstance = buildTextProvider();
  }
  return textProviderInstance;
}

export function getTTSProvider(): TTSProvider {
  if (!ttsProviderInstance) {
    ttsProviderInstance = buildTTSProvider();
  }
  return ttsProviderInstance;
}

// ─── Runtime Config API ─────────────────────────────────────────────────

/** Returns safe config (no API keys) for frontend display */
export function getPublicConfig() {
  return {
    textProvider: currentConfig.textProvider,
    ttsProvider: currentConfig.ttsProvider,
    geminiTextModel: currentConfig.geminiTextModel,
    geminiTtsModel: currentConfig.geminiTtsModel,
    openaiTextModel: currentConfig.openaiTextModel,
    openaiBaseUrl: currentConfig.openaiBaseUrl,
    openaiTtsModel: currentConfig.openaiTtsModel,
    openaiTtsVoice: currentConfig.openaiTtsVoice,
    ollamaBaseUrl: currentConfig.ollamaBaseUrl,
    ollamaTextModel: currentConfig.ollamaTextModel,
    llamacppBaseUrl: currentConfig.llamacppBaseUrl,
    llamacppTextModel: currentConfig.llamacppTextModel,
    piperBinaryPath: currentConfig.piperBinaryPath,
    piperModelPath: currentConfig.piperModelPath,
    // Boolean flags for available providers
    hasGeminiKey: !!currentConfig.geminiApiKey,
    hasOpenaiKey: !!currentConfig.openaiApiKey,
  };
}

/** Update config at runtime (partial update) */
export function updateConfig(partial: Partial<AppConfig>) {
  currentConfig = { ...currentConfig, ...partial };
  // Rebuild providers if the provider type changed
  if (partial.textProvider !== undefined || partial.geminiApiKey !== undefined ||
      partial.geminiTextModel !== undefined || partial.openaiApiKey !== undefined ||
      partial.openaiBaseUrl !== undefined || partial.openaiTextModel !== undefined ||
      partial.ollamaBaseUrl !== undefined || partial.ollamaTextModel !== undefined ||
      partial.llamacppBaseUrl !== undefined || partial.llamacppTextModel !== undefined) {
    textProviderInstance = null; // will be rebuilt on next call
  }
  if (partial.ttsProvider !== undefined || partial.geminiApiKey !== undefined ||
      partial.geminiTtsModel !== undefined || partial.openaiApiKey !== undefined ||
      partial.openaiBaseUrl !== undefined || partial.openaiTtsModel !== undefined ||
      partial.openaiTtsVoice !== undefined || partial.piperBinaryPath !== undefined ||
      partial.piperModelPath !== undefined) {
    ttsProviderInstance = null;
  }
}
