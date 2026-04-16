import { GoogleGenAI, Modality } from "@google/genai";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

// Common interface for all TTS providers
export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, voice: string): Promise<Buffer>;
}

// ─── WAV Header Helper ──────────────────────────────────────────────────

function createWavBuffer(pcmData: Buffer | Uint8Array, sampleRate: number = 24000): Buffer {
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);

  // fmt sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);      // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);       // AudioFormat (1 for PCM)
  header.writeUInt16LE(1, 22);       // NumChannels (mono)
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32);       // BlockAlign
  header.writeUInt16LE(16, 34);      // BitsPerSample

  // data sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, Buffer.from(pcmData)]);
}

// ─── Gemini TTS Provider ────────────────────────────────────────────────

export class GeminiTTSProvider implements TTSProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-2.5-flash-preview-tts") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async synthesize(text: string, voice: string): Promise<Buffer> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    // Map friendly voice names to Gemini prebuilt voices
    const voiceMap: Record<string, string> = {
      british: "Kore",
      american: "Zephyr",
      uk: "Kore",
      us: "Zephyr",
    };
    const voiceName = voiceMap[voice.toLowerCase()] || voice;

    const response = await ai.models.generateContent({
      model: this.model,
      contents: [{ parts: [{ text: `Say in a ${voice} accent: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("Gemini TTS returned no audio data");
    }

    const pcmData = Buffer.from(base64Audio, "base64");
    return createWavBuffer(pcmData, 24000);
  }
}

// ─── Piper TTS Provider (Local) ─────────────────────────────────────────

export class PiperTTSProvider implements TTSProvider {
  readonly name = "piper";
  private binaryPath: string;
  private modelPath: string;

  constructor(binaryPath: string = "piper", modelPath: string = "") {
    this.binaryPath = binaryPath;
    this.modelPath = modelPath;
  }

  async synthesize(text: string, _voice: string): Promise<Buffer> {
    if (!this.modelPath) {
      throw new Error("PIPER_MODEL_PATH is required for Piper TTS provider");
    }

    // Write a unique temp WAV file
    const tmpFile = path.join(os.tmpdir(), `piper_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

    try {
      // Piper reads text from stdin and writes WAV to --output_file
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          this.binaryPath,
          ["--model", this.modelPath, "--output_file", tmpFile],
          { stdio: ["pipe", "pipe", "pipe"] }
        );

        let stderr = "";
        proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
        proc.on("error", (err: Error) => reject(new Error(`Failed to start Piper: ${err.message}. Is Piper installed at '${this.binaryPath}'?`)));
        proc.on("close", (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`Piper exited with code ${code}: ${stderr}`));
        });

        proc.stdin.write(text);
        proc.stdin.end();
      });

      const wavBuffer = fs.readFileSync(tmpFile);
      return wavBuffer;
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }
}

// ─── OpenAI TTS Provider ────────────────────────────────────────────────

export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai";
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private defaultVoice: string;

  constructor(
    apiKey: string,
    baseUrl: string = "https://api.openai.com",
    model: string = "tts-1",
    defaultVoice: string = "alloy",
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.defaultVoice = defaultVoice;
  }

  async synthesize(text: string, voice: string): Promise<Buffer> {
    // Map friendly names to OpenAI voice names
    const voiceMap: Record<string, string> = {
      british: "fable",    // British-sounding OpenAI voice
      american: "alloy",
      uk: "fable",
      us: "alloy",
    };
    const voiceName = voiceMap[voice.toLowerCase()] || voice || this.defaultVoice;

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

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI TTS API error ${res.status}: ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

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
      if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required for Gemini TTS provider");
      return new GeminiTTSProvider(config.geminiApiKey, config.geminiTtsModel);

    case "openai":
      return new OpenAITTSProvider(
        config.openaiApiKey || "",
        config.openaiBaseUrl,
        config.openaiTtsModel,
        config.openaiTtsVoice,
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
