import { describe, expect, it } from 'vitest';
import type { AccentCode } from '../../src/types/listening.js';
import { prepareTTSSynthesisPayload } from './preprocessor.js';
import {
  listSupportedAccents,
  normalizeAccentInput,
  resolveAccentVoice,
  type TTSRegistryConfig,
} from './registry.js';

const ALL_ACCENTS: AccentCode[] = ['uk', 'us', 'au', 'nz', 'in'];

describe('TTS Voice Registry & Connected-Speech Pre-Processor', () => {
  describe('normalizeAccentInput', () => {
    it('normalizes legacy voice names regardless of capitalization', () => {
      expect(normalizeAccentInput('British')).toBe('uk');
      expect(normalizeAccentInput('british')).toBe('uk');
      expect(normalizeAccentInput('American')).toBe('us');
      expect(normalizeAccentInput('american')).toBe('us');
    });

    it('normalizes 5-accent codes and BCP-47 tags, defaulting to us', () => {
      expect(normalizeAccentInput('uk')).toBe('uk');
      expect(normalizeAccentInput('en-GB')).toBe('uk');
      expect(normalizeAccentInput('us')).toBe('us');
      expect(normalizeAccentInput('au')).toBe('au');
      expect(normalizeAccentInput('en-AU')).toBe('au');
      expect(normalizeAccentInput('nz')).toBe('nz');
      expect(normalizeAccentInput('in')).toBe('in');
      expect(normalizeAccentInput(undefined)).toBe('us');
      expect(normalizeAccentInput('')).toBe('us');
    });
  });

  describe('resolveAccentVoice — 5 Accents × 3 Providers Matrix', () => {
    it('resolves all 5 accents for Gemini TTS with expected voices and isApproximate flags', () => {
      const config: TTSRegistryConfig = {
        ttsProvider: 'gemini',
        geminiTtsModel: 'gemini-3.1-flash-tts-preview',
      };

      const resolved = Object.fromEntries(
        ALL_ACCENTS.map((accent) => [accent, resolveAccentVoice(config, accent)])
      ) as Record<AccentCode, ReturnType<typeof resolveAccentVoice>>;

      expect(resolved.uk.voice).toBe('Kore');
      expect(resolved.uk.isApproximate).toBe(false);
      expect(resolved.uk.supportsInstructions).toBe(true);

      expect(resolved.us.voice).toBe('Zephyr');
      expect(resolved.us.isApproximate).toBe(false);

      expect(resolved.au.voice).toBe('Puck');
      expect(resolved.au.isApproximate).toBe(false);

      expect(resolved.nz.voice).toBe('Aoede');
      expect(resolved.nz.isApproximate).toBe(true);
      expect(resolved.nz.approximateReason).toMatch(/NZ/i);

      expect(resolved.in.voice).toBe('Charon');
      expect(resolved.in.isApproximate).toBe(false);
    });

    it('resolves all 5 accents for OpenAI gpt-4o-mini-tts (instructable)', () => {
      const config: TTSRegistryConfig = {
        ttsProvider: 'openai',
        openaiTtsModel: 'gpt-4o-mini-tts',
      };

      const resolved = Object.fromEntries(
        ALL_ACCENTS.map((accent) => [accent, resolveAccentVoice(config, accent)])
      ) as Record<AccentCode, ReturnType<typeof resolveAccentVoice>>;

      expect(resolved.uk.voice).toBe('fable');
      expect(resolved.uk.supportsInstructions).toBe(true);
      expect(resolved.uk.isApproximate).toBe(false);

      expect(resolved.us.voice).toBe('alloy');
      expect(resolved.us.isApproximate).toBe(false);

      expect(resolved.au.voice).toBe('coral');
      expect(resolved.au.isApproximate).toBe(false);

      expect(resolved.nz.voice).toBe('sage');
      expect(resolved.nz.isApproximate).toBe(true);
      expect(resolved.nz.approximateReason).toMatch(/NZ/i);

      expect(resolved.in.voice).toBe('ash');
      expect(resolved.in.isApproximate).toBe(false);
    });

    it('resolves all 5 accents for OpenAI legacy tts-1 (non-instructable) and marks AU/NZ/IN approximate', () => {
      const config: TTSRegistryConfig = {
        ttsProvider: 'openai',
        openaiTtsModel: 'tts-1',
      };

      const resolved = Object.fromEntries(
        ALL_ACCENTS.map((accent) => [accent, resolveAccentVoice(config, accent)])
      ) as Record<AccentCode, ReturnType<typeof resolveAccentVoice>>;

      for (const accent of ALL_ACCENTS) {
        expect(resolved[accent].supportsInstructions).toBe(false);
      }

      expect(resolved.uk.voice).toBe('fable');
      expect(resolved.uk.isApproximate).toBe(false);

      expect(resolved.us.voice).toBe('alloy');
      expect(resolved.us.isApproximate).toBe(false);

      expect(resolved.au.voice).toBe('nova');
      expect(resolved.au.isApproximate).toBe(true);
      expect(resolved.au.approximateReason).toMatch(/tts-1/i);

      expect(resolved.nz.voice).toBe('fable');
      expect(resolved.nz.isApproximate).toBe(true);

      expect(resolved.in.voice).toBe('echo');
      expect(resolved.in.isApproximate).toBe(true);
    });

    it('resolves all 5 accents for Piper with single default .onnx vs per-accent .onnx overrides', () => {
      const defaultPiperConfig: TTSRegistryConfig = {
        ttsProvider: 'piper',
        piperModelPath: './en_GB-alan-medium.onnx',
      };

      const ukDefault = resolveAccentVoice(defaultPiperConfig, 'uk');
      expect(ukDefault.supportsInstructions).toBe(false);
      expect(ukDefault.voice).toBe('./en_GB-alan-medium.onnx');
      expect(ukDefault.isApproximate).toBe(false);

      for (const nonUk of ['us', 'au', 'nz', 'in'] as AccentCode[]) {
        const profile = resolveAccentVoice(defaultPiperConfig, nonUk);
        expect(profile.voice).toBe('./en_GB-alan-medium.onnx');
        expect(profile.isApproximate).toBe(true);
        expect(profile.approximateReason).toBeTruthy();
      }

      // With explicit US and AU model paths configured
      const multiModelPiperConfig: TTSRegistryConfig = {
        ttsProvider: 'piper',
        piperModelPath: './en_GB-alan-medium.onnx',
        piperModelPaths: {
          us: './en_US-amy-medium.onnx',
          au: './en_AU-custom.onnx',
        },
      };

      const usConfigured = resolveAccentVoice(multiModelPiperConfig, 'us');
      expect(usConfigured.voice).toBe('./en_US-amy-medium.onnx');
      expect(usConfigured.isApproximate).toBe(false);

      const auConfigured = resolveAccentVoice(multiModelPiperConfig, 'au');
      expect(auConfigured.voice).toBe('./en_AU-custom.onnx');
      expect(auConfigured.isApproximate).toBe(false);
    });

    it('listSupportedAccents returns descriptors for all 5 accents', () => {
      const descriptors = listSupportedAccents({ ttsProvider: 'gemini' });
      expect(descriptors.map((d) => d.accent)).toEqual(['uk', 'us', 'au', 'nz', 'in']);
    });
  });

  describe('prepareTTSSynthesisPayload', () => {
    it('builds director instructions and strips stage directions for instructable models (Gemini / gpt-4o-mini-tts)', () => {
      const profile = resolveAccentVoice(
        { ttsProvider: 'gemini', geminiTtsModel: 'gemini-3.1-flash-tts-preview' },
        'au'
      );

      const payload = prepareTTSSynthesisPayload(
        {
          text: '[muffled] ...Would you have come if he did?',
          category: 'assimilation',
          targetPhrase: 'Would you',
          simulatedPronunciation: 'Woul-dja',
        },
        profile
      );

      expect(payload.spokenText).toBe('Would you have come if he did?');
      expect(payload.verificationStatus).toBe('instructed_unverified');
      expect(payload.instructions).toContain('Australian English');
      expect(payload.instructions).toContain('Would you');
      expect(payload.instructions).toContain('Woul-dja');
      expect(payload.isApproximate).toBe(false);
    });

    it('applies conservative orthographic contractions and strips stage directions for non-instructable models (tts-1 / Piper)', () => {
      const tts1Profile = resolveAccentVoice(
        { ttsProvider: 'openai', openaiTtsModel: 'tts-1' },
        'us'
      );

      const goingToPayload = prepareTTSSynthesisPayload(
        {
          text: "[muffled] It's going to involve you having to leave the house.",
          category: 'contractions',
          targetPhrase: 'going to',
          simulatedPronunciation: 'gonna',
        },
        tts1Profile
      );

      expect(goingToPayload.instructions).toBeUndefined();
      expect(goingToPayload.verificationStatus).toBe('orthographic_approx');
      expect(goingToPayload.spokenText).toBe("It's gonna involve you having to leave the house.");

      const hDropPayload = prepareTTSSynthesisPayload(
        {
          text: '(sighs) Tell him I could have helped.',
          category: 'h_dropping',
          targetPhrase: 'Tell him',
          simulatedPronunciation: "Tell 'im",
        },
        tts1Profile
      );

      expect(hDropPayload.spokenText).toBe("Tell 'im I could've helped.");
      expect(hDropPayload.verificationStatus).toBe('orthographic_approx');
    });
  });
});
