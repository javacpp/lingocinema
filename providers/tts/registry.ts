import type { AccentCode } from '../../src/types/listening.js';

export interface TTSRegistryConfig {
  ttsProvider: string;
  geminiTtsModel?: string;
  openaiTtsModel?: string;
  openaiTtsVoice?: string;
  piperModelPath?: string;
  geminiVoices?: Partial<Record<AccentCode, string>>;
  openaiVoices?: Partial<Record<AccentCode, string>>;
  piperModelPaths?: Partial<Record<AccentCode, string>>;
}

export interface ResolvedVoiceProfile {
  provider: string;
  model: string;
  accent: AccentCode;
  label: string;
  bcp47: string;
  voice: string;
  supportsInstructions: boolean;
  isApproximate: boolean;
  approximateReason?: string;
}

export interface AccentDescriptor {
  accent: AccentCode;
  label: string;
  bcp47: string;
  voice: string;
  isApproximate: boolean;
  approximateReason?: string;
}

export const ACCENT_METADATA: Record<AccentCode, { label: string; bcp47: string }> = {
  uk: { label: 'British (UK)', bcp47: 'en-GB' },
  us: { label: 'American (US)', bcp47: 'en-US' },
  au: { label: 'Australian (AU)', bcp47: 'en-AU' },
  nz: { label: 'New Zealand (NZ)', bcp47: 'en-NZ' },
  in: { label: 'Indian (IN)', bcp47: 'en-IN' },
};

const ALL_ACCENTS: AccentCode[] = ['uk', 'us', 'au', 'nz', 'in'];

const DEFAULT_GEMINI_VOICES: Record<AccentCode, string> = {
  uk: 'Kore',
  us: 'Zephyr',
  au: 'Puck',
  nz: 'Aoede',
  in: 'Charon',
};

const DEFAULT_OPENAI_INSTRUCT_VOICES: Record<AccentCode, string> = {
  uk: 'fable',
  us: 'alloy',
  au: 'coral',
  nz: 'sage',
  in: 'ash',
};

const DEFAULT_OPENAI_LEGACY_VOICES: Record<AccentCode, string> = {
  uk: 'fable',
  us: 'alloy',
  au: 'nova',
  nz: 'fable',
  in: 'echo',
};

/**
 * Normalizes legacy voice strings (`'British'`, `'american'`) or BCP-47 tags (`'en-GB'`, `'en-AU'`)
 * into a canonical 5-accent `AccentCode` (`'uk' | 'us' | 'au' | 'nz' | 'in'`).
 */
export function normalizeAccentInput(voiceOrAccent?: string | null): AccentCode {
  if (!voiceOrAccent) return 'us';
  const cleaned = voiceOrAccent.trim().toLowerCase();

  switch (cleaned) {
    case 'uk':
    case 'gb':
    case 'british':
    case 'en-gb':
    case 'en_gb':
      return 'uk';
    case 'us':
    case 'american':
    case 'en-us':
    case 'en_us':
      return 'us';
    case 'au':
    case 'australian':
    case 'en-au':
    case 'en_au':
      return 'au';
    case 'nz':
    case 'new zealand':
    case 'kiwi':
    case 'en-nz':
    case 'en_nz':
      return 'nz';
    case 'in':
    case 'indian':
    case 'en-in':
    case 'en_in':
      return 'in';
    default:
      return 'us';
  }
}

/**
 * Resolves the concrete voice ID, model, instruction capability, and `isApproximate` provenance
 * for a given `(config, accent)` pair across Gemini, OpenAI (`gpt-4o-mini-tts` vs `tts-1`), and Piper.
 */
export function resolveAccentVoice(
  config: TTSRegistryConfig,
  accent: AccentCode
): ResolvedVoiceProfile {
  const provider = (config.ttsProvider || 'gemini').trim().toLowerCase();
  const meta = ACCENT_METADATA[accent] ?? ACCENT_METADATA.us;

  if (provider === 'gemini') {
    const model = config.geminiTtsModel || 'gemini-3.1-flash-tts-preview';
    const voice = config.geminiVoices?.[accent] || DEFAULT_GEMINI_VOICES[accent];
    const isApproximate = accent === 'nz';
    return {
      provider,
      model,
      accent,
      label: meta.label,
      bcp47: meta.bcp47,
      voice,
      supportsInstructions: true,
      isApproximate,
      approximateReason: isApproximate ? 'Prompt-steered NZ accent' : undefined,
    };
  }

  if (provider === 'openai') {
    const model = config.openaiTtsModel || 'tts-1';
    const isLegacyTts1 = model.trim().toLowerCase().startsWith('tts-1');

    if (!isLegacyTts1) {
      const voice = config.openaiVoices?.[accent] || DEFAULT_OPENAI_INSTRUCT_VOICES[accent];
      const isApproximate = accent === 'nz';
      return {
        provider,
        model,
        accent,
        label: meta.label,
        bcp47: meta.bcp47,
        voice,
        supportsInstructions: true,
        isApproximate,
        approximateReason: isApproximate ? 'Prompt-steered NZ accent' : undefined,
      };
    }

    const defaultLegacyVoice =
      accent === 'us' && config.openaiTtsVoice
        ? config.openaiTtsVoice
        : DEFAULT_OPENAI_LEGACY_VOICES[accent];
    const voice = config.openaiVoices?.[accent] || defaultLegacyVoice;
    const isApproximate = accent === 'au' || accent === 'nz' || accent === 'in';
    let approximateReason: string | undefined;
    if (accent === 'au') {
      approximateReason = 'tts-1 does not support AU locale; switch to gpt-4o-mini-tts or Gemini';
    } else if (isApproximate) {
      approximateReason = 'tts-1 fallback voice';
    }

    return {
      provider,
      model,
      accent,
      label: meta.label,
      bcp47: meta.bcp47,
      voice,
      supportsInstructions: false,
      isApproximate,
      approximateReason,
    };
  }

  if (provider === 'piper') {
    const explicitPath = config.piperModelPaths?.[accent]?.trim();
    const defaultPath = config.piperModelPath?.trim() || 'en_GB-alan-medium.onnx';
    const voice = explicitPath || defaultPath;
    const isUkDefault = accent === 'uk' && /en[_-]gb/i.test(defaultPath);
    const isApproximate = !explicitPath && !isUkDefault;

    return {
      provider,
      model: 'piper-onnx',
      accent,
      label: meta.label,
      bcp47: meta.bcp47,
      voice,
      supportsInstructions: false,
      isApproximate,
      approximateReason: isApproximate
        ? `Piper ${accent.toUpperCase()} model not configured; using default model (${defaultPath})`
        : undefined,
    };
  }

  // Fallback for fake or custom providers in tests
  return {
    provider,
    model: config.geminiTtsModel || config.openaiTtsModel || 'custom-tts',
    accent,
    label: meta.label,
    bcp47: meta.bcp47,
    voice: `voice-${accent}`,
    supportsInstructions: true,
    isApproximate: accent === 'nz',
    approximateReason: accent === 'nz' ? 'Prompt-steered NZ accent' : undefined,
  };
}

/**
 * Lists all 5 supported accents with their resolved voice and approximation metadata for the active config.
 */
export function listSupportedAccents(config: TTSRegistryConfig): AccentDescriptor[] {
  return ALL_ACCENTS.map((accent) => {
    const resolved = resolveAccentVoice(config, accent);
    return {
      accent: resolved.accent,
      label: resolved.label,
      bcp47: resolved.bcp47,
      voice: resolved.voice,
      isApproximate: resolved.isApproximate,
      approximateReason: resolved.approximateReason,
    };
  });
}
