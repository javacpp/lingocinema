import { NewExtractedItem } from '../../db/interface.js';

export interface TextProvider {
  readonly name: string;
  analyze(rawText: string): Promise<NewExtractedItem[]>;
}
