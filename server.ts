import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import SrtParser from "srt-parser-2";
import {
  getTextProvider,
  getTTSProvider,
  getPublicConfig,
  updateConfig,
} from "./server/config.js";

const app = express();
const PORT = 3000;
const upload = multer({ dest: "uploads/" });

// Database initialization
const db = new Database("lingocinema.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS subtitles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS extracted_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subtitle_id INTEGER,
    type TEXT, -- word, idiom, collocation, slang, grammar
    term TEXT,
    meaning_en TEXT,
    meaning_zh TEXT,
    phonetic TEXT,
    part_of_speech TEXT,
    usage_scenarios_en TEXT,
    usage_scenarios_zh TEXT,
    examples_en TEXT,
    examples_zh TEXT,
    synonyms TEXT,
    frequency TEXT,
    level TEXT, -- A1, A2, B1, B2, C1, C2
    FOREIGN KEY (subtitle_id) REFERENCES subtitles(id)
  );
`);

app.use(express.json({ limit: "10mb" }));

// ─── Existing CRUD Routes ───────────────────────────────────────────────

app.get("/api/subtitles", (req, res) => {
  const rows = db.prepare("SELECT * FROM subtitles ORDER BY created_at DESC").all();
  res.json(rows);
});

app.post("/api/subtitles/upload", upload.single("subtitle"), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const content = fs.readFileSync(req.file.path, "utf-8");
  const filename = req.file.originalname;

  const info = db.prepare("INSERT INTO subtitles (filename, content) VALUES (?, ?)").run(filename, content);
  const subtitleId = info.lastInsertRowid;

  fs.unlinkSync(req.file.path);
  res.json({ id: subtitleId, filename });
});

app.get("/api/subtitles/:id", (req, res) => {
  const { id } = req.params;
  const subtitle = db.prepare("SELECT * FROM subtitles WHERE id = ?").get(id);
  if (!subtitle) return res.status(404).json({ error: "Subtitle not found" });
  res.json(subtitle);
});

app.post("/api/save-items", async (req, res) => {
  const { subtitleId, items } = req.body;

  try {
    const insert = db.prepare(`
      INSERT INTO extracted_items (
        subtitle_id, type, term, meaning_en, meaning_zh, phonetic, 
        part_of_speech, usage_scenarios_en, usage_scenarios_zh, 
        examples_en, examples_zh, synonyms, frequency, level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((items) => {
      for (const item of items) {
        insert.run(
          subtitleId,
          item.type,
          item.term,
          item.meaning_en,
          item.meaning_zh,
          item.phonetic || "",
          item.part_of_speech || "",
          item.usage_scenarios_en || "",
          item.usage_scenarios_zh || "",
          item.examples_en || "",
          item.examples_zh || "",
          item.synonyms || "",
          item.frequency || "",
          item.level || "B1"
        );
      }
    });

    transaction(items);
    res.json({ success: true, count: items.length });
  } catch (error) {
    console.error("Save Items Error:", error);
    res.status(500).json({ error: "Failed to save items" });
  }
});

app.get("/api/items/:subtitleId", (req, res) => {
  const { subtitleId } = req.params;
  const { levels } = req.query;
  
  let query = "SELECT * FROM extracted_items WHERE subtitle_id = ?";
  const params: any[] = [subtitleId];
  
  if (levels) {
    const levelList = Array.isArray(levels) ? levels : (levels as string).split(",");
    const placeholders = levelList.map(() => "?").join(",");
    query += ` AND level IN (${placeholders})`;
    params.push(...levelList);
  }
  
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

app.delete("/api/subtitles/:id", (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("DELETE FROM extracted_items WHERE subtitle_id = ?").run(id);
    db.prepare("DELETE FROM subtitles WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete Subtitle Error:", error);
    res.status(500).json({ error: "Failed to delete subtitle" });
  }
});

// ─── NEW: AI Provider Routes ────────────────────────────────────────────

/**
 * POST /api/analyze
 * Analyze a subtitle using the configured text LLM provider.
 * Body: { subtitleId: number }
 */
app.post("/api/analyze", async (req, res) => {
  const { subtitleId } = req.body;
  if (!subtitleId) return res.status(400).json({ error: "subtitleId is required" });

  try {
    // 1. Fetch subtitle content
    const subtitle = db.prepare("SELECT * FROM subtitles WHERE id = ?").get(subtitleId) as any;
    if (!subtitle) return res.status(404).json({ error: "Subtitle not found" });

    // 2. Parse SRT
    const parser = new SrtParser();
    const parsed = parser.fromSrt(subtitle.content);
    const rawText = parsed.map((p: any) => p.text).join(" ").slice(0, 40000);

    // 3. Call configured text provider
    const provider = getTextProvider();
    console.log(`[Analyze] Using text provider: ${provider.name}`);
    const extractedItems = await provider.analyze(rawText);

    // 4. Save items to DB
    const insert = db.prepare(`
      INSERT INTO extracted_items (
        subtitle_id, type, term, meaning_en, meaning_zh, phonetic,
        part_of_speech, usage_scenarios_en, usage_scenarios_zh,
        examples_en, examples_zh, synonyms, frequency, level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((items: any[]) => {
      for (const item of items) {
        insert.run(
          subtitleId,
          item.type,
          item.term,
          item.meaning_en,
          item.meaning_zh,
          item.phonetic || "",
          item.part_of_speech || "",
          item.usage_scenarios_en || "",
          item.usage_scenarios_zh || "",
          item.examples_en || "",
          item.examples_zh || "",
          item.synonyms || "",
          item.frequency || "",
          item.level || "B1"
        );
      }
    });

    transaction(extractedItems);
    res.json({ success: true, count: extractedItems.length, provider: provider.name });
  } catch (error: any) {
    console.error("Analyze Error:", error);
    res.status(500).json({ error: `Analysis failed: ${error.message}` });
  }
});

/**
 * POST /api/tts
 * Generate speech audio using the configured TTS provider.
 * Body: { text: string, voice: string }
 * Returns: WAV audio binary
 */
app.post("/api/tts", async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  try {
    const provider = getTTSProvider();
    console.log(`[TTS] Using TTS provider: ${provider.name}`);
    const wavBuffer = await provider.synthesize(text, voice || "American");

    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": String(wavBuffer.length),
    });
    res.send(wavBuffer);
  } catch (error: any) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: `TTS failed: ${error.message}` });
  }
});

/**
 * GET /api/config
 * Returns the current provider configuration (no API keys).
 */
app.get("/api/config", (req, res) => {
  res.json(getPublicConfig());
});

/**
 * POST /api/config
 * Update provider configuration at runtime.
 * Body: Partial<AppConfig> (e.g. { textProvider: "ollama" })
 */
app.post("/api/config", (req, res) => {
  try {
    updateConfig(req.body);
    res.json({ success: true, config: getPublicConfig() });
  } catch (error: any) {
    console.error("Config Update Error:", error);
    res.status(500).json({ error: `Config update failed: ${error.message}` });
  }
});

// ─── Vite middleware for development ────────────────────────────────────

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
