import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AccentCode } from '../../src/types/listening.js';
import {
  LegacyVoiceName,
  TTSProvider,
  TTSSynthesisOptions,
  TTSSynthesisOutput,
} from './interface.js';
import { prepareTTSSynthesisPayload } from './preprocessor.js';
import { normalizeAccentInput, resolveAccentVoice } from './registry.js';

export class PiperTTSProvider implements TTSProvider {
  readonly name = 'piper';
  private binaryPath: string;
  private modelPath: string;
  private piperModelPaths?: Partial<Record<AccentCode, string>>;

  constructor(
    binaryPath: string = 'piper',
    modelPath: string = '',
    piperModelPaths?: Partial<Record<AccentCode, string>>
  ) {
    this.binaryPath = binaryPath;
    this.modelPath = modelPath;
    this.piperModelPaths = piperModelPaths;
  }

  async synthesize(text: string, voice?: LegacyVoiceName): Promise<Buffer> {
    if (!this.modelPath && !this.piperModelPaths) {
      throw new Error('PIPER_MODEL_PATH is required');
    }
    const accent = normalizeAccentInput(voice);
    const out = await this.synthesizeAdvanced(text, { accent });
    return out.wavBuffer;
  }

  async synthesizeAdvanced(
    text: string,
    options: TTSSynthesisOptions = {}
  ): Promise<TTSSynthesisOutput> {
    const accent = options.accent ?? 'us';
    const explicitAccentModel = this.piperModelPaths?.[accent]?.trim();
    const defaultModel = this.modelPath.trim();

    if (!explicitAccentModel && !defaultModel) {
      throw new Error('PIPER_MODEL_PATH is required');
    }

    const profile = resolveAccentVoice(
      {
        ttsProvider: 'piper',
        piperModelPath: defaultModel,
        piperModelPaths: this.piperModelPaths,
      },
      accent
    );

    const resolvedModelPath = options.voiceName || explicitAccentModel || defaultModel;
    const prepared = prepareTTSSynthesisPayload(
      {
        text,
        category: options.phoneticCategory,
        targetPhrase: options.targetPhrase,
        simulatedPronunciation: options.simulatedPronunciation,
      },
      profile
    );

    const tmpFile = path.join(
      os.tmpdir(),
      `piper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`
    );

    const args: string[] = ['--model', resolvedModelPath, '--output_file', tmpFile];
    if (options.speedMultiplier && options.speedMultiplier > 0 && options.speedMultiplier !== 1.0) {
      // Piper --length_scale is inverse to playback speed (< 1.0 is faster, > 1.0 is slower)
      const lengthScale = Number((1 / options.speedMultiplier).toFixed(2));
      args.push('--length_scale', String(lengthScale));
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '';
      proc.stderr.on('data', (d: Buffer | string) => {
        stderr += d.toString();
      });
      proc.on('error', (err: Error) => {
        reject(err);
      });
      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `Piper exited with code ${String(code)}`));
        }
      });
      proc.stdin.write(prepared.spokenText);
      proc.stdin.end();
    });

    const wavBuffer = fs.readFileSync(tmpFile);
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup error if already removed
    }

    return {
      wavBuffer,
      provider: this.name,
      model: profile.model,
      voiceUsed: resolvedModelPath,
      accent,
      isApproximate: profile.isApproximate,
      approximateReason: profile.approximateReason,
      verificationStatus: 'orthographic_approx',
    };
  }
}
