import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import SrtParser from "srt-parser-2";
import dotenv from "dotenv";

import { getDatabase } from "./db/index.js";
import { createTextProvider } from "./providers/text/index.js";
import { createTTSProvider } from "./providers/tts/index.js";
import { TextProvider } from "./providers/text/interface.js";
import { TTSProvider } from "./providers/tts/interface.js";

dotenv.config({ path: [".env.local", ".env"] });

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

const db = getDatabase();

// ─── Provider State ─────────────────────────────────────────────────────

interface AppConfig {
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
  textProvider: process.env.TEXT_PROVIDER || "gemini",
  ttsProvider: process.env.TTS_PROVIDER || "gemini",
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
  geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL || "",
  geminiMaxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || "32768", 10) || 32768,
  geminiTtsModel: process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview",
  openaiTextModel: process.env.OPENAI_TEXT_MODEL || "gpt-4o",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com",
  openaiTtsModel: process.env.OPENAI_TTS_MODEL || "tts-1",
  openaiTtsVoice: process.env.OPENAI_TTS_VOICE || "alloy",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ollamaTextModel: process.env.OLLAMA_TEXT_MODEL || "llama3",
  llamacppBaseUrl: process.env.LLAMACPP_BASE_URL || "http://localhost:8080",
  llamacppTextModel: process.env.LLAMACPP_TEXT_MODEL || "default",
  piperBinaryPath: process.env.PIPER_BINARY_PATH || "piper",
  piperModelPath: process.env.PIPER_MODEL_PATH || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
};

let activeTextProvider: TextProvider | null = null;
let activeTTSProvider: TTSProvider | null = null;

function loadProviders() {
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

function updateConfig(updates: Partial<AppConfig>) {
  if (updates.geminiMaxOutputTokens !== undefined) {
    updates.geminiMaxOutputTokens = Number(updates.geminiMaxOutputTokens) || 32768;
  }
  Object.assign(currentConfig, updates);
  loadProviders();
}

// Initial load & validation
try {
  loadProviders();
} catch (err) {
  console.error("Provider initialization failed:", err);
  process.exit(1);
}

// ─── API Routes ─────────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));

app.get("/api/subtitles", (req, res) => {
  try {
    const data = db.getSubtitles();
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subtitles" });
  }
});

app.post("/api/subtitles/upload", upload.single("subtitle"), async (req: Request, res: Response) => {
  try {
    const multerReq = req as Request & { file?: { buffer: Buffer; originalname: string } };
    if (!multerReq.file) return res.status(400).json({ error: "No file uploaded" });

    const content = multerReq.file.buffer.toString("utf-8");
    const filename = multerReq.file.originalname;

    const subtitleId = db.insertSubtitle(filename, content);
    res.status(201).json({ data: { id: subtitleId, filename } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload subtitle" });
  }
});

app.get("/api/subtitles/:id", (req, res) => {
  try {
    const subtitle = db.getSubtitleById(parseInt(req.params.id));
    if (!subtitle) return res.status(404).json({ error: "Subtitle not found" });
    res.json({ data: subtitle });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subtitle" });
  }
});

app.post("/api/save-items", async (req, res) => {
  try {
    const { subtitleId, items } = req.body;
    db.bulkInsertItems(subtitleId, items);
    res.json({ data: { success: true, count: items.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save items" });
  }
});

app.get("/api/items/:subtitleId", (req, res) => {
  try {
    const levels = req.query.levels as string | undefined;
    const levelList = levels ? levels.split(",") : undefined;
    const data = db.getItemsBySubtitleId(parseInt(req.params.subtitleId), levelList);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

app.delete("/api/subtitles/:id", (req, res) => {
  try {
    db.deleteSubtitle(parseInt(req.params.id));
    res.json({ data: { success: true } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete subtitle" });
  }
});

app.post("/api/analyze", async (req: Request, res: Response) => {
  try {
    const { subtitleId } = req.body;
    if (!subtitleId) return res.status(400).json({ error: "subtitleId is required" });

    const subtitle = db.getSubtitleById(parseInt(subtitleId));
    if (!subtitle) return res.status(404).json({ error: "Subtitle not found" });

    const parser = new SrtParser();
    const parsed = parser.fromSrt(subtitle.content);
    const rawText = parsed.map((p: { text: string }) => p.text).join(" ").slice(0, 40000);

    if (!activeTextProvider) throw new Error("Provider not initialized");
    const extractedItems = await activeTextProvider.analyze(rawText);

    db.bulkInsertItems(parseInt(subtitleId), extractedItems);
    res.json({ data: { success: true, count: extractedItems.length } });
  } catch (err) {
    console.error("Analyze Error:", err);
    res.status(500).json({ error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.post("/api/tts", async (req: Request, res: Response) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    if (!activeTTSProvider) throw new Error("Provider not initialized");
    const wavBuffer = await activeTTSProvider.synthesize(text, voice || "american");

    res.set({ "Content-Type": "audio/wav", "Content-Length": String(wavBuffer.length) });
    res.send(wavBuffer);
  } catch (err) {
    console.error("TTS Error:", err);
    res.status(500).json({ error: `TTS failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.get("/api/config", (req: Request, res: Response) => {
  res.json(getPublicConfig());
});

app.post("/api/config", (req: Request, res: Response) => {
  try {
    updateConfig(req.body);
    res.json({ config: getPublicConfig() });
  } catch (err) {
    console.error("Config Update Error:", err);
    res.status(500).json({ error: `Config update failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─── Vite middleware ────────────────────────────────────────────────────

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
