import type { AccentCode, AudioVerificationStatus } from '../../src/types/listening.js';
import {
  LegacyVoiceName,
  TTSProvider,
  TTSSynthesisOptions,
  TTSSynthesisOutput,
} from './interface.js';
import { prepareTTSSynthesisPayload } from './preprocessor.js';
import { normalizeAccentInput, resolveAccentVoice } from './registry.js';

export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private defaultVoice: string;
  private openaiVoices?: Partial<Record<AccentCode, string>>;

  constructor(
    apiKey: string,
    baseUrl: string,
    model: string,
    defaultVoice: string,
    openaiVoices?: Partial<Record<AccentCode, string>>
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.defaultVoice = defaultVoice;
    this.openaiVoices = openaiVoices;
  }

  async synthesize(text: string, accent: LegacyVoiceName): Promise<Buffer> {
    const normalized = normalizeAccentInput(accent);
    const out = await this.synthesizeAdvanced(text, { accent: normalized });
    return out.wavBuffer;
  }

  private async requestSpeech(body: Record<string, unknown>): Promise<Response> {
    return fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }

  async synthesizeAdvanced(
    text: string,
    options: TTSSynthesisOptions = {}
  ): Promise<TTSSynthesisOutput> {
    const accent = options.accent ?? 'us';
    const profile = resolveAccentVoice(
      {
        ttsProvider: 'openai',
        openaiTtsModel: this.model,
        openaiTtsVoice: this.defaultVoice,
        openaiVoices: this.openaiVoices,
      },
      accent
    );

    const voiceName = options.voiceName || profile.voice;
    const prepared = prepareTTSSynthesisPayload(
      {
        text,
        category: options.phoneticCategory,
        targetPhrase: options.targetPhrase,
        simulatedPronunciation: options.simulatedPronunciation,
      },
      profile
    );

    const instructions = profile.supportsInstructions
      ? (options.instructions ?? prepared.instructions)
      : undefined;

    const basePayload: Record<string, unknown> = {
      model: this.model,
      input: prepared.spokenText,
      voice: voiceName,
      response_format: 'wav',
      ...(options.speedMultiplier ? { speed: options.speedMultiplier } : {}),
    };

    const firstPayload: Record<string, unknown> = instructions
      ? { ...basePayload, instructions }
      : basePayload;

    let res = await this.requestSpeech(firstPayload);
    let verificationStatus: AudioVerificationStatus = instructions
      ? 'instructed_unverified'
      : 'orthographic_approx';

    // Mitigation per Design Section 11.3: retry once without `instructions` if custom endpoint rejects with 400
    if (!res.ok && res.status === 400 && instructions) {
      res = await this.requestSpeech(basePayload);
      verificationStatus = 'orthographic_approx';
    }

    if (!res.ok) {
      const errorObj = new Error(`OpenAI TTS API error ${res.status}`) as Error & {
        status?: number;
      };
      errorObj.status = res.status;
      throw errorObj;
    }

    const wavBuffer = Buffer.from(await res.arrayBuffer());
    return {
      wavBuffer,
      provider: this.name,
      model: this.model,
      voiceUsed: voiceName,
      accent,
      isApproximate: profile.isApproximate,
      approximateReason: profile.approximateReason,
      verificationStatus,
    };
  }
}
