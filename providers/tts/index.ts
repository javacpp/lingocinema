import type { AccentCode } from '../../src/types/listening.js';
import { TTSProvider } from './interface.js';
import { GeminiTTSProvider } from './gemini.js';
import { OpenAITTSProvider } from './openai.js';
import { PiperTTSProvider } from './piper.js';

function readEnvAccentMap(prefix: string): Partial<Record<AccentCode, string>> | undefined {
  const accents: AccentCode[] = ['uk', 'us', 'au', 'nz', 'in'];
  const result: Partial<Record<AccentCode, string>> = {};
  let hasAny = false;
  for (const accent of accents) {
    const val = process.env[`${prefix}_${accent.toUpperCase()}`]?.trim();
    if (val) {
      result[accent] = val;
      hasAny = true;
    }
  }
  return hasAny ? result : undefined;
}

export function createTTSProvider(config: {
  provider: string;
  geminiApiKey?: string;
  geminiTtsModel?: string;
  geminiVoices?: Partial<Record<AccentCode, string>>;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiTtsModel?: string;
  openaiTtsVoice?: string;
  openaiVoices?: Partial<Record<AccentCode, string>>;
  piperBinaryPath?: string;
  piperModelPath?: string;
  piperModelPaths?: Partial<Record<AccentCode, string>>;
}): TTSProvider {
  switch (config.provider) {
    case 'gemini':
      if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is required');
      return new GeminiTTSProvider(
        config.geminiApiKey,
        config.geminiTtsModel,
        config.geminiVoices ?? readEnvAccentMap('GEMINI_VOICE')
      );
    case 'openai':
      return new OpenAITTSProvider(
        config.openaiApiKey || '',
        config.openaiBaseUrl || 'https://api.openai.com',
        config.openaiTtsModel || 'tts-1',
        config.openaiTtsVoice || 'alloy',
        config.openaiVoices ?? readEnvAccentMap('OPENAI_VOICE')
      );
    case 'piper':
      return new PiperTTSProvider(
        config.piperBinaryPath || 'piper',
        config.piperModelPath || '',
        config.piperModelPaths ?? readEnvAccentMap('PIPER_MODEL_PATH')
      );
    default:
      throw new Error(`Unknown TTS provider: ${config.provider}`);
  }
}
