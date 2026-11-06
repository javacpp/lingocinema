import express, { type Express, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import SrtParser from 'srt-parser-2';
import dotenv from 'dotenv';

import { getDatabase } from './db/index.js';
import type { IDatabase } from './db/interface.js';
import { createTextProvider } from './providers/text/index.js';
import { createTTSProvider } from './providers/tts/index.js';
import type { TextProvider } from './providers/text/interface.js';
import type { TTSProvider } from './providers/tts/interface.js';
import { AudioCacheService } from './providers/tts/cache.js';
import type { TTSRegistryConfig } from './providers/tts/registry.js';
import { createListeningRouter } from './src/routes/listening.js';

dotenv.config({ path: ['.env.local', '.env'] });

const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

// ─── Provider State ─────────────────────────────────────────────────────

export interface AppConfig extends TTSRegistryConfig {
  textProvider: string;
  ttsProvider: string;
  geminiTextModel: string;
  geminiThinkingLevel: string;
  geminiMaxOutputTokens: number;
  geminiTtsModel: string;
  openaiTextModel: string;
  openaiBaseUrl: string;
  openaiTtsModel: string;
  openaiTtsVoice: string;
  ollamaBaseUrl: string;
  ollamaTextModel: string;
  llamacppBaseUrl: string;
  llamacppTextModel: string;
  piperBinaryPath: string;
  piperModelPath: string;
  geminiApiKey: string;
  openaiApiKey: string;
}

const currentConfig: AppConfig = {
  textProvider: process.env.TEXT_PROVIDER || 'gemini',
  ttsProvider: process.env.TTS_PROVIDER || 'gemini',
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash',
  geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL || '',
  geminiMaxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '32768', 10) || 32768,
  geminiTtsModel: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview',
  openaiTextModel: process.env.OPENAI_TEXT_MODEL || 'gpt-4o',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
  openaiTtsModel: process.env.OPENAI_TTS_MODEL || 'tts-1',
  openaiTtsVoice: process.env.OPENAI_TTS_VOICE || 'alloy',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaTextModel: process.env.OLLAMA_TEXT_MODEL || 'llama3',
  llamacppBaseUrl: process.env.LLAMACPP_BASE_URL || 'http://localhost:8080',
  llamacppTextModel: process.env.LLAMACPP_TEXT_MODEL || 'default',
  piperBinaryPath: process.env.PIPER_BINARY_PATH || 'piper',
  piperModelPath: process.env.PIPER_MODEL_PATH || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
};

let activeTextProvider: TextProvider | null = null;
let activeTTSProvider: TTSProvider | null = null;

function loadProviders(): void {
  activeTextProvider = createTextProvider({
    provider: currentConfig.textProvider,
    geminiApiKey: currentConfig.geminiApiKey,
    geminiModel: currentConfig.geminiTextModel,
    geminiThinkingLevel: currentConfig.geminiThinkingLevel,
    geminiMaxOutputTokens: currentConfig.geminiMaxOutputTokens,
    openaiApiKey: currentConfig.openaiApiKey,
    openaiBaseUrl: currentConfig.openaiBaseUrl,
    openaiModel: currentConfig.openaiTextModel,
    ollamaBaseUrl: currentConfig.ollamaBaseUrl,
    ollamaModel: currentConfig.ollamaTextModel,
    llamacppBaseUrl: currentConfig.llamacppBaseUrl,
    llamacppModel: currentConfig.llamacppTextModel,
  });

  activeTTSProvider = createTTSProvider({
    provider: currentConfig.ttsProvider,
    geminiApiKey: currentConfig.geminiApiKey,
    geminiTtsModel: currentConfig.geminiTtsModel,
    openaiApiKey: currentConfig.openaiApiKey,
    openaiBaseUrl: currentConfig.openaiBaseUrl,
    openaiTtsModel: currentConfig.openaiTtsModel,
    openaiTtsVoice: currentConfig.openaiTtsVoice,
    piperBinaryPath: currentConfig.piperBinaryPath,
    piperModelPath: currentConfig.piperModelPath,
  });
}

function getPublicConfig() {
  return {
    textProvider: currentConfig.textProvider,
    ttsProvider: currentConfig.ttsProvider,
    geminiTextModel: currentConfig.geminiTextModel,
    geminiThinkingLevel: currentConfig.geminiThinkingLevel,
    geminiMaxOutputTokens: currentConfig.geminiMaxOutputTokens,
    geminiTtsModel: currentConfig.geminiTtsModel,
    openaiTextModel: currentConfig.openaiTextModel,
    openaiBaseUrl: currentConfig.openaiBaseUrl,
    openaiTtsModel: currentConfig.openaiTtsModel,
    openaiTtsVoice: currentConfig.openaiTtsVoice,
    ollamaBaseUrl: currentConfig.ollamaBaseUrl,
    ollamaTextModel: currentConfig.ollamaTextModel,
    llamacppBaseUrl: currentConfig.llamacppBaseUrl,
    llamacppTextModel: currentConfig.llamacppTextModel,
    piperBinaryPath: currentConfig.piperBinaryPath,
    piperModelPath: currentConfig.piperModelPath,
    hasGeminiKey: !!currentConfig.geminiApiKey,
    hasOpenaiKey: !!currentConfig.openaiApiKey,
  };
}

function updateConfig(updates: Partial<AppConfig>): void {
  if (updates.geminiMaxOutputTokens !== undefined) {
    updates.geminiMaxOutputTokens = Number(updates.geminiMaxOutputTokens) || 32768;
  }
  Object.assign(currentConfig, updates);
  loadProviders();
}

export interface CreateAppOptions {
  db?: IDatabase;
  getTextProvider?: () => TextProvider | null;
  getTTSProvider?: () => TTSProvider | null;
  config?: Partial<TTSRegistryConfig>;
  cacheDir?: string;
  maxCacheBytes?: number;
  dailyWarnLimit?: number;
  retryBaseDelayMs?: number;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const db = options.db ?? getDatabase();
  const getText = options.getTextProvider ?? (() => activeTextProvider);
  const getTTS = options.getTTSProvider ?? (() => activeTTSProvider);
  const getCfg = (): TTSRegistryConfig => ({
    ...currentConfig,
    ...options.config,
    ttsProvider: options.config?.ttsProvider ?? currentConfig.ttsProvider,
  });

  const audioCache = new AudioCacheService({
    db,
    cacheDir: options.cacheDir,
    maxCacheBytes: options.maxCacheBytes,
    dailyWarnLimit: options.dailyWarnLimit,
    retryBaseDelayMs: options.retryBaseDelayMs,
  });

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/subtitles', (_req: Request, res: Response) => {
    try {
      const data = db.getSubtitles();
      res.json({ data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch subtitles' });
    }
  });

  app.post(
    '/api/subtitles/upload',
    upload.single('subtitle'),
    async (req: Request, res: Response) => {
      try {
        const multerReq = req as Request & { file?: { buffer: Buffer; originalname: string } };
        if (!multerReq.file) return res.status(400).json({ error: 'No file uploaded' });

        const content = multerReq.file.buffer.toString('utf-8');
        const filename = multerReq.file.originalname;

        const subtitleId = db.insertSubtitle(filename, content);
        res.status(201).json({ data: { id: subtitleId, filename } });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to upload subtitle' });
      }
    }
  );

  app.get('/api/subtitles/:id', (req: Request, res: Response) => {
    try {
      const subtitle = db.getSubtitleById(parseInt(req.params.id, 10));
      if (!subtitle) return res.status(404).json({ error: 'Subtitle not found' });
      res.json({ data: subtitle });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch subtitle' });
    }
  });

  app.post('/api/save-items', async (req: Request, res: Response) => {
    try {
      const { subtitleId, items } = req.body;
      db.bulkInsertItems(subtitleId, items);
      res.json({ data: { success: true, count: items.length } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save items' });
    }
  });

  app.get('/api/items/:subtitleId', (req: Request, res: Response) => {
    try {
      const levels = req.query.levels as string | undefined;
      const levelList = levels ? levels.split(',') : undefined;
      const data = db.getItemsBySubtitleId(parseInt(req.params.subtitleId, 10), levelList);
      res.json({ data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  app.delete('/api/subtitles/:id', (req: Request, res: Response) => {
    try {
      db.deleteSubtitle(parseInt(req.params.id, 10));
      res.json({ data: { success: true } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete subtitle' });
    }
  });

  app.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const { subtitleId } = req.body;
      if (!subtitleId) return res.status(400).json({ error: 'subtitleId is required' });

      const subtitle = db.getSubtitleById(parseInt(String(subtitleId), 10));
      if (!subtitle) return res.status(404).json({ error: 'Subtitle not found' });

      const parser = new SrtParser();
      const parsed = parser.fromSrt(subtitle.content);

      let header = '';
      if (parsed.length > 0) {
        const lastCue = parsed[parsed.length - 1];
        const runtimeStr = lastCue?.endTime || '';
        header = `[SUBTITLE CONTEXT: cues=${parsed.length}${runtimeStr ? `, duration=${runtimeStr}` : ''}]\n\n`;
      }

      const dialogueLines =
        parsed.length > 0
          ? parsed.map((p: { text: string }) => p.text).join(' ')
          : subtitle.content;
      const rawText = header + dialogueLines;

      const textProvider = getText();
      if (!textProvider) throw new Error('Provider not initialized');
      const extractedItems = await textProvider.analyze(rawText);

      db.bulkInsertItems(parseInt(String(subtitleId), 10), extractedItems);
      res.json({ data: { success: true, count: extractedItems.length } });
    } catch (err) {
      console.error('Analyze Error:', err);
      res
        .status(500)
        .json({ error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(getPublicConfig());
  });

  app.post('/api/config', (req: Request, res: Response) => {
    try {
      updateConfig(req.body);
      res.json({ config: getPublicConfig() });
    } catch (err) {
      console.error('Config Update Error:', err);
      res
        .status(500)
        .json({
          error: `Config update failed: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
  });

  app.use(
    createListeningRouter({
      db,
      getTextProvider: getText,
      getTTSProvider: getTTS,
      getConfig: getCfg,
      audioCache,
    })
  );

  return app;
}

// ─── Vite middleware & Server Startup ───────────────────────────────────

async function startServer(): Promise<void> {
  try {
    loadProviders();
  } catch (err) {
    console.error('Provider initialization failed:', err);
    process.exit(1);
  }

  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer();
}
