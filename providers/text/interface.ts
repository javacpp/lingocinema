import { NewExtractedItem } from '../../db/interface.js';
import type {
  AudioVerificationStatus,
  NewListeningDifficulty,
  NewListeningExample,
  PhoneticCategory,
} from '../../src/types/listening.js';

export interface ExampleGenerationRequest {
  category: PhoneticCategory;
  phrase: string;
  spokenPhrase: string;
  simulatedPronunciation: string;
  originalSentence: string;
  explanationZh: string;
  explanationEn?: string;
  validationFeedback?: string;
}

export interface AudioVerificationInput {
  targetPhrase: string;
  simulatedPronunciation: string;
}

export interface AudioVerificationResult {
  status: AudioVerificationStatus;
  note: string;
}

export interface TextProvider {
  readonly name: string;
  analyze(rawText: string): Promise<NewExtractedItem[]>;
  analyzeListening?(formattedCuesText: string): Promise<NewListeningDifficulty[]>;
  generateListeningExamples?(req: ExampleGenerationRequest): Promise<NewListeningExample[]>;
  verifyConnectedSpeechAudio?(
    wavBuffer: Buffer,
    input: AudioVerificationInput
  ): Promise<AudioVerificationResult>;
}
