import Database from 'better-sqlite3';
import { IDatabase, Subtitle, ExtractedItem, NewExtractedItem } from './interface.js';

export class SQLiteDatabase implements IDatabase {
  private db: Database.Database;

  constructor(dbPath: string = 'lingocinema.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subtitles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS extracted_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subtitle_id INTEGER,
        type TEXT,
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
        level TEXT,
        FOREIGN KEY (subtitle_id) REFERENCES subtitles(id)
      );
    `);
  }

  getSubtitles(): Subtitle[] {
    return this.db.prepare('SELECT * FROM subtitles ORDER BY created_at DESC').all() as Subtitle[];
  }

  getSubtitleById(id: number): Subtitle | undefined {
    return this.db.prepare('SELECT * FROM subtitles WHERE id = ?').get(id) as Subtitle | undefined;
  }

  insertSubtitle(filename: string, content: string): number {
    const info = this.db.prepare('INSERT INTO subtitles (filename, content) VALUES (?, ?)').run(filename, content);
    return info.lastInsertRowid as number;
  }

  deleteSubtitle(id: number): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM extracted_items WHERE subtitle_id = ?').run(id);
      this.db.prepare('DELETE FROM subtitles WHERE id = ?').run(id);
    });
    transaction();
  }

  getItemsBySubtitleId(subtitleId: number, levels?: string[]): ExtractedItem[] {
    let query = 'SELECT * FROM extracted_items WHERE subtitle_id = ?';
    const params: (number | string)[] = [subtitleId];

    if (levels && levels.length > 0) {
      const placeholders = levels.map(() => '?').join(',');
      query += ` AND level IN (${placeholders})`;
      params.push(...levels);
    }

    query += ' ORDER BY id ASC';

    return this.db.prepare(query).all(...params) as ExtractedItem[];
  }

  bulkInsertItems(subtitleId: number, items: NewExtractedItem[]): void {
    const insert = this.db.prepare(`
      INSERT INTO extracted_items (
        subtitle_id, type, term, meaning_en, meaning_zh, phonetic, 
        part_of_speech, usage_scenarios_en, usage_scenarios_zh, 
        examples_en, examples_zh, synonyms, frequency, level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: NewExtractedItem[]) => {
      for (const item of items) {
        insert.run(
          subtitleId,
          item.type,
          item.term,
          item.meaning_en,
          item.meaning_zh,
          item.phonetic || '',
          item.part_of_speech || '',
          item.usage_scenarios_en || '',
          item.usage_scenarios_zh || '',
          item.examples_en || '',
          item.examples_zh || '',
          item.synonyms || '',
          item.frequency || '',
          item.level || 'B1'
        );
      }
    });

    transaction(items);
  }
}
