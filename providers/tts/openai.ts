import { TTSProvider } from './interface.js';

export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai";
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private defaultVoice: string;

  constructor(apiKey: string, baseUrl: string, model: string, defaultVoice: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.defaultVoice = defaultVoice;
  }

  async synthesize(text: string, accent: 'american' | 'british'): Promise<Buffer> {
    const voiceMap: Record<string, string> = { british: "fable", american: "alloy" };
    const voiceName = voiceMap[accent] || this.defaultVoice;

    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: voiceName,
        response_format: "wav",
      }),
    });

    if (!res.ok) throw new Error(`OpenAI TTS API error ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
