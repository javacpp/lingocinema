import type {
  AccentCode,
  AudioVerificationStatus,
  PhoneticCategory,
} from '../../src/types/listening.js';

export type LegacyVoiceName = 'american' | 'british' | 'American' | 'British';

export interface TTSSynthesisOptions {
  accent?: AccentCode;
  voiceName?: string;
  instructions?: string; // Used by Gemini TTS and OpenAI gpt-4o-mini-tts
  speedMultiplier?: number; // Used only when speedMode is native
  phoneticCategory?: PhoneticCategory;
  targetPhrase?: string;
  simulatedPronunciation?: string;
}

export interface TTSSynthesisOutput {
  wavBuffer: Buffer;
  provider: string;
  model: string;
  voiceUsed: string;
  accent: AccentCode;
  isApproximate: boolean;
  approximateReason?: string;
  verificationStatus: AudioVerificationStatus;
}

export interface TTSProvider {
  readonly name: string;
  // Existing signature kept intact for backwards compatibility:
  synthesize(text: string, voice: LegacyVoiceName): Promise<Buffer>;
  // Extended synthesis with full accent/instruction metadata:
  synthesizeAdvanced?(text: string, options: TTSSynthesisOptions): Promise<TTSSynthesisOutput>;
}
