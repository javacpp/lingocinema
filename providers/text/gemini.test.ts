import { describe, it, expect } from 'vitest';
import { estimateExtractionTarget } from './gemini.js';

describe('estimateExtractionTarget', () => {
  it('correctly calculates target for ~45 min TV episode using subtitle context header', () => {
    const text = '[SUBTITLE CONTEXT: cues=850, duration=00:45:00,000]\n\nHello there...';
    const result = estimateExtractionTarget(text);

    expect(result.durationMinutes).toBe(45);
    expect(result.minTarget).toBe(80);
    expect(result.maxTarget).toBe(100);
  });

  it('correctly scales target for ~120 min movie using subtitle context header', () => {
    const text = '[SUBTITLE CONTEXT: cues=2100, duration=02:00:00,000]\n\nThis is a long movie dialogue...';
    const result = estimateExtractionTarget(text);

    expect(result.durationMinutes).toBe(120);
    expect(result.minTarget).toBeGreaterThanOrEqual(200);
    expect(result.maxTarget).toBeGreaterThanOrEqual(250);
  });

  it('correctly scales target for ~90 min movie', () => {
    const text = '[SUBTITLE CONTEXT: cues=1600, duration=01:30:00,000]\n\nMovie dialogue...';
    const result = estimateExtractionTarget(text);

    expect(result.durationMinutes).toBe(90);
    expect(result.minTarget).toBe(160);
    expect(result.maxTarget).toBe(200);
  });

  it('falls back to character-length estimation when no subtitle context header is present', () => {
    // 31,500 chars / 700 chars per min ≈ 45 min
    const fake45MinText = 'a'.repeat(31500);
    const result = estimateExtractionTarget(fake45MinText);

    expect(result.durationMinutes).toBe(45);
    expect(result.minTarget).toBe(80);
    expect(result.maxTarget).toBe(100);
  });

  it('enforces reasonable minimum floor for very short texts', () => {
    const shortText = 'Brief line of text';
    const result = estimateExtractionTarget(shortText);

    expect(result.minTarget).toBeGreaterThanOrEqual(80);
    expect(result.maxTarget).toBeGreaterThanOrEqual(100);
  });
});
