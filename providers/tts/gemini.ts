import { GoogleGenAI, Modality } from '@google/genai';
import type { AccentCode } from '../../src/types/listening.js';
import {
  LegacyVoiceName,
  TTSProvider,
  TTSSynthesisOptions,
  TTSSynthesisOutput,
} from './interface.js';
import { prepareTTSSynthesisPayload } from './preprocessor.js';
import { normalizeAccentInput, resolveAccentVoice } from './registry.js';

function createWavBuffer(pcmData: Buffer | Uint8Array, sampleRate: number = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, Buffer.from(pcmData)]);
}

export class GeminiTTSProvider implements TTSProvider {
  readonly name = 'gemini';
  private apiKey: string;
  private model: string;
  private geminiVoices?: Partial<Record<AccentCode, string>>;

  constructor(
    apiKey: string,
    model: string = 'gemini-3.1-flash-tts-preview',
    geminiVoices?: Partial<Record<AccentCode, string>>
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.geminiVoices = geminiVoices;
  }

  async synthesize(text: string, voice: LegacyVoiceName): Promise<Buffer> {
    const accent = normalizeAccentInput(voice);
    const out = await this.synthesizeAdvanced(text, { accent });
    return out.wavBuffer;
  }

  async synthesizeAdvanced(
    text: string,
    options: TTSSynthesisOptions = {}
  ): Promise<TTSSynthesisOutput> {
    const accent = options.accent ?? 'us';
    const profile = resolveAccentVoice(
      {
        ttsProvider: 'gemini',
        geminiTtsModel: this.model,
        geminiVoices: this.geminiVoices,
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

    const instructions = options.instructions ?? prepared.instructions;
    const promptText = instructions
      ? `${instructions}\n\nLine: "${prepared.spokenText}"`
      : prepared.spokenText;

    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error('Gemini TTS returned no audio data');

    return {
      wavBuffer: createWavBuffer(Buffer.from(base64Audio, 'base64'), 24000),
      provider: this.name,
      model: this.model,
      voiceUsed: voiceName,
      accent,
      isApproximate: profile.isApproximate,
      approximateReason: profile.approximateReason,
      verificationStatus: 'instructed_unverified',
    };
  }
}
