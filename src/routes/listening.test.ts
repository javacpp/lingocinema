import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLiteDatabase } from '../../db/sqlite.js';
import { createApp } from '../../server.js';
import { GOLDEN_PART2_ITEMS } from '../test/fixtures/listeningDifficulties.fixture.js';
import { INVALID_B1_EXAMPLE_BATCH } from '../test/fixtures/listeningExamples.fixture.js';
import {
  FakeRateLimitError,
  FakeTextProvider,
  FakeTTSProvider,
  SAMPLE_SRT,
} from '../test/fakes.js';

describe('Listening & TTS Routes (/api/listening/*, /api/tts*)', () => {
  let db: SQLiteDatabase;
  let tempCacheDir: string;
  let textProvider: FakeTextProvider;
  let ttsProvider: FakeTTSProvider;

  beforeEach(() => {
    db = new SQLiteDatabase(':memory:');
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingocinema-routes-test-'));
    textProvider = new FakeTextProvider({ name: 'gemini' });
    ttsProvider = new FakeTTSProvider({ name: 'gemini', model: 'gemini-3.1-flash-tts-preview' });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  });

  function buildApp(ttsProviderName = 'gemini', ttsModel = 'gemini-3.1-flash-tts-preview') {
    return createApp({
      db,
      getTextProvider: () => textProvider,
      getTTSProvider: () => ttsProvider,
      config: {
        ttsProvider: ttsProviderName,
        geminiTtsModel: ttsModel,
        openaiTtsModel: ttsModel,
      },
      cacheDir: tempCacheDir,
      retryBaseDelayMs: 5,
    });
  }

  it('preserves legacy Part 1 routes (/api/subtitles, /api/items/:subtitleId, and legacy POST /api/tts)', async () => {
    const app = buildApp();
    const subId = db.insertSubtitle('episode1.srt', SAMPLE_SRT);
    db.bulkInsertItems(subId, [
      {
        type: 'idiom',
        term: 'wing it',
        meaning_en: 'improvise',
        meaning_zh: '即兴发挥',
        phonetic: '/wɪŋ ɪt/',
        part_of_speech: 'verb phrase',
        usage_scenarios_en: 'Casual speech',
        usage_scenarios_zh: '日常口语',
        examples_en: "We'll just have to wing it.",
        examples_zh: '我们只能见机行事了。',
        synonyms: 'improvise',
        frequency: 'Tier 1',
        level: 'B2',
      },
    ]);

    const subRes = await request(app).get('/api/subtitles');
    expect(subRes.status).toBe(200);
    expect(subRes.body.data).toHaveLength(1);

    const itemsRes = await request(app).get(`/api/items/${subId}?levels=B2`);
    expect(itemsRes.status).toBe(200);
    expect(itemsRes.body.data).toHaveLength(1);
    expect(itemsRes.body.data[0].term).toBe('wing it');

    // Legacy POST /api/tts with capitalized voice: 'British'
    const ttsRes = await request(app).post('/api/tts').send({ text: 'wing it', voice: 'British' });

    expect(ttsRes.status).toBe(200);
    expect(ttsRes.headers['content-type']).toMatch(/audio\/wav/);
    expect(ttsRes.headers['x-tts-accent']).toBe('uk');
    expect(ttsRes.headers['x-tts-voice']).toBe('Kore');
    expect(ttsRes.headers['x-tts-cache']).toBe('MISS');
    expect(Buffer.from(ttsRes.body).subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  it('POST /api/listening/:subtitleId/analyze extracts Part 2 items, links cues, and persists to SQLite', async () => {
    const app = buildApp();
    const subId = db.insertSubtitle('ludwig.srt', SAMPLE_SRT);

    const res = await request(app).post(`/api/listening/${subId}/analyze`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.subtitleId).toBe(subId);
    expect(res.body.data.itemCount).toBe(GOLDEN_PART2_ITEMS.length);
    expect(res.body.data.items).toHaveLength(GOLDEN_PART2_ITEMS.length);
    expect(textProvider.calls.analyzeListening).toBe(1);
    expect(textProvider.lastInput.analyzeListening).toContain('[#12 00:01:14,200 -> 00:01:17,050]');

    // Verify GET /api/listening/:subtitleId returns countsByCategory and supports category filter
    const listRes = await request(app).get(`/api/listening/${subId}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items).toHaveLength(7);
    expect(listRes.body.data.countsByCategory.assimilation).toBe(1);
    expect(listRes.body.data.countsByCategory.catenation).toBe(1);

    const filteredRes = await request(app).get(`/api/listening/${subId}?category=assimilation`);
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body.data.items).toHaveLength(1);
    expect(filteredRes.body.data.items[0].phrase).toBe('Would you');
  });

  it('returns 400 and 404 structured error envelopes on invalid or missing subtitleId', async () => {
    const app = buildApp();

    const badId = await request(app).get('/api/listening/not-a-number');
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe('VALIDATION_ERROR');

    const badCat = await request(app).get('/api/listening/1?category=invalid_cat');
    expect(badCat.status).toBe(400);
    expect(badCat.body.code).toBe('VALIDATION_ERROR');

    const missingSub = await request(app).post('/api/listening/999/analyze').send({});
    expect(missingSub.status).toBe(404);
    expect(missingSub.body.code).toBe('SUBTITLE_NOT_FOUND');
  });

  it('PATCH /api/listening/item/:id/mastery toggles mastery and filters when includeMastered=false', async () => {
    const app = buildApp();
    const subId = db.insertSubtitle('ludwig.srt', SAMPLE_SRT);
    const items = db.replaceListeningDifficulties(subId, GOLDEN_PART2_ITEMS);
    const targetId = items[0].id;

    const patchRes = await request(app)
      .patch(`/api/listening/item/${targetId}/mastery`)
      .send({ isMastered: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data).toEqual({ id: targetId, isMastered: true });

    const unmasteredList = await request(app).get(`/api/listening/${subId}?includeMastered=false`);
    expect(unmasteredList.status).toBe(200);
    expect(unmasteredList.body.data.items).toHaveLength(GOLDEN_PART2_ITEMS.length - 1);

    const invalidBody = await request(app)
      .patch(`/api/listening/item/${targetId}/mastery`)
      .send({ isMastered: 'yes' });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.code).toBe('VALIDATION_ERROR');
  });

  it('lazily generates, validates, persists, and regenerates B1 examples for a difficulty item', async () => {
    const app = buildApp();
    const subId = db.insertSubtitle('ludwig.srt', SAMPLE_SRT);
    const items = db.replaceListeningDifficulties(subId, GOLDEN_PART2_ITEMS);
    const assimilationItem = items.find((i) => i.category === 'assimilation')!;

    // 1. First GET with autoGenerate=true invokes LLM and persists
    const firstGet = await request(app).get(
      `/api/listening/item/${assimilationItem.id}/examples?autoGenerate=true`
    );
    expect(firstGet.status).toBe(200);
    expect(firstGet.body.data.generatedNow).toBe(true);
    expect(firstGet.body.data.examples).toHaveLength(3);
    expect(textProvider.calls.generateListeningExamples).toBe(1);

    // 2. Second GET reads from SQLite without calling LLM again
    const secondGet = await request(app).get(
      `/api/listening/item/${assimilationItem.id}/examples?autoGenerate=true`
    );
    expect(secondGet.status).toBe(200);
    expect(secondGet.body.data.generatedNow).toBe(false);
    expect(secondGet.body.data.examples).toHaveLength(3);
    expect(textProvider.calls.generateListeningExamples).toBe(1);

    // 3. POST .../regenerate forces a fresh LLM call and replaces stored examples
    const regenRes = await request(app)
      .post(`/api/listening/item/${assimilationItem.id}/examples/regenerate`)
      .send({});
    expect(regenRes.status).toBe(200);
    expect(regenRes.body.data.examples).toHaveLength(3);
    expect(textProvider.calls.generateListeningExamples).toBe(2);
  });

  it('retries once when example validation fails and returns 422 EXAMPLE_VALIDATION_FAILED if still invalid', async () => {
    textProvider = new FakeTextProvider({
      name: 'gemini',
      examplesResult: INVALID_B1_EXAMPLE_BATCH,
    });
    const app = buildApp();
    const subId = db.insertSubtitle('ludwig.srt', SAMPLE_SRT);
    const [firstItem] = db.replaceListeningDifficulties(subId, GOLDEN_PART2_ITEMS);

    const res = await request(app).get(`/api/listening/item/${firstItem.id}/examples`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EXAMPLE_VALIDATION_FAILED');
    // Initial attempt + 1 validation retry = 2 calls
    expect(textProvider.calls.generateListeningExamples).toBe(2);
  });

  it('serves cached WAV on second POST /api/tts request, reports cache stats, and clears cache', async () => {
    const app = buildApp();

    const payload = {
      text: 'Would you have come if he did?',
      accent: 'nz',
      category: 'assimilation',
      targetPhrase: 'Would you',
      simulatedPronunciation: 'Woul-dja',
    };

    const missRes = await request(app).post('/api/tts').send(payload);
    expect(missRes.status).toBe(200);
    expect(missRes.headers['x-tts-cache']).toBe('MISS');
    expect(missRes.headers['x-tts-accent']).toBe('nz');
    expect(missRes.headers['x-tts-voice']).toBe('Aoede');
    expect(missRes.headers['x-tts-approximate']).toBe('true');
    expect(missRes.headers['x-tts-verification']).toBe('instructed_unverified');
    expect(ttsProvider.calls.synthesizeAdvanced).toBe(1);

    const hitRes = await request(app).post('/api/tts').send(payload);
    expect(hitRes.status).toBe(200);
    expect(hitRes.headers['x-tts-cache']).toBe('HIT');
    expect(hitRes.headers['x-tts-cache-key']).toBe(missRes.headers['x-tts-cache-key']);
    expect(ttsProvider.calls.synthesizeAdvanced).toBe(1);

    const statsRes = await request(app).get('/api/tts/cache/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.entryCount).toBe(1);
    expect(statsRes.body.data.todaySynthesizedCount).toBe(1);

    const delRes = await request(app).delete('/api/tts/cache');
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.deletedFiles).toBe(1);

    const statsAfterDel = await request(app).get('/api/tts/cache/stats');
    expect(statsAfterDel.body.data.entryCount).toBe(0);
  });

  it('returns 429 RATE_LIMITED when TTS provider persistently fails with 429', async () => {
    ttsProvider = new FakeTTSProvider({
      name: 'gemini',
      rateLimitFailures: 5,
    });
    const app = buildApp();

    const res = await request(app).post('/api/tts').send({
      text: 'Rate limited sentence',
      accent: 'uk',
    });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it('returns 429 RATE_LIMITED when text provider throws 429 during Part 2 analysis', async () => {
    textProvider.errors.analyzeListening = new FakeRateLimitError();
    const app = buildApp();
    const subId = db.insertSubtitle('ludwig.srt', SAMPLE_SRT);

    const res = await request(app).post(`/api/listening/${subId}/analyze`).send({});
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});
