export interface Subtitle {
  id: number;
  filename: string;
  content: string;
  created_at: string;
}

export interface NewExtractedItem {
  type: string;
  term: string;
  meaning_en: string;
  meaning_zh: string;
  phonetic: string;
  part_of_speech: string;
  usage_scenarios_en: string;
  usage_scenarios_zh: string;
  examples_en: string;
  examples_zh: string;
  synonyms: string;
  frequency: string;
  level: string;
}

export interface ExtractedItem extends NewExtractedItem {
  id: number;
  subtitle_id: number;
}

export interface IDatabase {
  getSubtitles(): Subtitle[];
  getSubtitleById(id: number): Subtitle | undefined;
  insertSubtitle(filename: string, content: string): number;
  deleteSubtitle(id: number): void;
  getItemsBySubtitleId(subtitleId: number, levels?: string[]): ExtractedItem[];
  bulkInsertItems(subtitleId: number, items: NewExtractedItem[]): void;
}
