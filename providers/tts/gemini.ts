import { TTSProvider } from './interface.js';
import { GoogleGenAI, Modality } from "@google/genai";

function createWavBuffer(pcmData: Buffer | Uint8Array, sampleRate: number = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, Buffer.from(pcmData)]);
}

export class GeminiTTSProvider implements TTSProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-2.5-flash-preview-tts") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async synthesize(text: string, voice: 'american' | 'british'): Promise<Buffer> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const voiceMap: Record<string, string> = { british: "Kore", american: "Zephyr" };
    const voiceName = voiceMap[voice] || "Zephyr";

    const response = await ai.models.generateContent({
      model: this.model,
      contents: [{ parts: [{ text: `Say in a ${voice} accent: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Gemini TTS returned no audio data");
    return createWavBuffer(Buffer.from(base64Audio, "base64"), 24000);
  }
}
