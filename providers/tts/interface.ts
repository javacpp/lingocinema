export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, accent: 'american' | 'british'): Promise<Buffer>;
}
