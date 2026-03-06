import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  ChevronRight, 
  BookOpen, 
  Layers, 
  Search, 
  Loader2, 
  CheckCircle2,
  Globe,
  Volume2,
  Languages,
  Info,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import SrtParser from "srt-parser-2";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Subtitle = {
  id: number;
  filename: string;
  created_at: string;
};

type ExtractedItem = {
  id: number;
  term: string;
  type: string;
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
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export default function App() {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<Subtitle | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>(['B1', 'B2', 'C1']);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeItem, setActiveItem] = useState<ExtractedItem | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSubtitles();
  }, []);

  useEffect(() => {
    if (selectedSubtitle) {
      fetchItems(selectedSubtitle.id, selectedLevels);
    }
  }, [selectedSubtitle, selectedLevels]);

  const fetchSubtitles = async () => {
    try {
      const res = await fetch('/api/subtitles');
      const data = await res.json();
      setSubtitles(data);
    } catch (err) {
      console.error('Failed to fetch subtitles', err);
    }
  };

  const fetchItems = async (id: number, levels: string[]) => {
    try {
      const res = await fetch(`/api/items/${id}?levels=${levels.join(',')}`);
      const data = await res.json();
      setItems(data);
    } catch (err) {
      console.error('Failed to fetch items', err);
    }
  };

  const deleteSubtitle = async (id: number) => {
    if (!confirm('Are you sure you want to delete this subtitle and all its extracted items?')) return;
    try {
      await fetch(`/api/subtitles/${id}`, { method: 'DELETE' });
      if (selectedSubtitle?.id === id) {
        setSelectedSubtitle(null);
        setItems([]);
      }
      fetchSubtitles();
    } catch (err) {
      console.error('Failed to delete subtitle', err);
    }
  };

  const toggleLevel = (level: string) => {
    setSelectedLevels(prev => 
      prev.includes(level) 
        ? prev.filter(l => l !== level) 
        : [...prev, level]
    );
  };

  const playAudio = async (text: string, accent: 'British' | 'American') => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(accent);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `Say in a ${accent} accent: ${text}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: accent === 'British' ? 'Kore' : 'Zephyr' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        // Gemini TTS returns raw PCM 16-bit 24kHz. We need to wrap it in a WAV header.
        const pcmData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        
        // RIFF chunk descriptor
        view.setUint32(0, 0x52494646, false); // "RIFF"
        view.setUint32(4, 36 + pcmData.length, true);
        view.setUint32(8, 0x57415645, false); // "WAVE"
        
        // fmt sub-chunk
        view.setUint32(12, 0x666d7420, false); // "fmt "
        view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
        view.setUint16(22, 1, true); // NumChannels (1 for mono)
        view.setUint32(24, 24000, true); // SampleRate (24000 for Gemini TTS)
        view.setUint32(28, 24000 * 2, true); // ByteRate
        view.setUint16(32, 2, true); // BlockAlign
        view.setUint16(34, 16, true); // BitsPerSample
        
        // data sub-chunk
        view.setUint32(36, 0x64617461, false); // "data"
        view.setUint32(40, pcmData.length, true);

        const blob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
          setIsPlayingAudio(null);
          URL.revokeObjectURL(audioUrl);
        };
        await audio.play();
      } else {
        setIsPlayingAudio(null);
      }
    } catch (err) {
      console.error('Audio playback failed', err);
      setIsPlayingAudio(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('subtitle', file);

    try {
      const res = await fetch('/api/subtitles/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      await fetchSubtitles();
      setSelectedSubtitle(data);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
    }
  };

  const processSubtitle = async () => {
    if (!selectedSubtitle) return;
    setIsProcessing(true);
    try {
      // 1. Fetch subtitle content
      const subRes = await fetch(`/api/subtitles/${selectedSubtitle.id}`);
      const subtitle = await subRes.json();

      // 2. Parse subtitle
      const parser = new SrtParser();
      const parsed = parser.fromSrt(subtitle.content);
      // Increase context to 40k characters for more comprehensiveness
      const rawText = parsed.map(p => p.text).join(" ").slice(0, 40000);

      // 3. Call Gemini AI
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `
        Analyze the following movie subtitle text and extract ALL English words, idioms, collocations, slangs, and grammar points that a learner might want to study.
        
        BE EXTREMELY EXHAUSTIVE. DO NOT SKIP:
        - Words in ALL CAPS (e.g., "INHALES", "MUMBLES", "STAMMERS", "TOOTS") - these are often important for context. Label these as "stage direction" or "sound effect".
        - Specialized or formal terms (e.g., "tetanus", "solicitor", "impersonating", "commandeered", "locomotive").
        - Descriptive adjectives and adverbs (e.g., "bonneted", "artistically", "grisly").
        - Multi-word phrases and collocations (e.g., "over the course of a year", "big-shot", "commandeered the biggest").
        - Phrasal verbs and idioms.
        - Any word that is NOT extremely basic (A1 level).
        
        For each item, categorize it into a CEFR level (A1, A2, B1, B2, C1, C2).
        
        For each item, provide:
        1. Term (The exact word or phrase)
        2. Type (word, idiom, collocation, slang, grammar, stage direction, sound effect)
        3. Meaning in English
        4. Meaning in Chinese
        5. Phonetic symbols
        6. Part of speech
        7. Common usage scenarios (English & Chinese)
        8. Example sentences (English & Chinese)
        9. Synonyms
        10. Frequency in daily life (e.g., Very High, High, Medium, Low)
        11. CEFR Level (A1, A2, B1, B2, C1, C2)
        
        Text: ${rawText}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                type: { type: Type.STRING, description: "One of: word, idiom, collocation, slang, grammar, stage direction, sound effect" },
                meaning_en: { type: Type.STRING },
                meaning_zh: { type: Type.STRING },
                phonetic: { type: Type.STRING },
                part_of_speech: { type: Type.STRING },
                usage_scenarios_en: { type: Type.STRING },
                usage_scenarios_zh: { type: Type.STRING },
                examples_en: { type: Type.STRING },
                examples_zh: { type: Type.STRING },
                synonyms: { type: Type.STRING },
                frequency: { type: Type.STRING },
                level: { type: Type.STRING, description: "CEFR Level: A1, A2, B1, B2, C1, or C2" },
              },
              required: ["term", "type", "meaning_en", "meaning_zh", "level"]
            }
          }
        }
      });

      const extractedItems = JSON.parse(response.text || "[]");

      // 4. Save items to backend
      await fetch('/api/save-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subtitleId: selectedSubtitle.id, 
          items: extractedItems
        }),
      });

      await fetchItems(selectedSubtitle.id, selectedLevels);
    } catch (err) {
      console.error('Processing failed', err);
      alert('AI Processing failed. Please check your console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.meaning_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.meaning_zh.includes(searchTerm)
  );

  return (
    <div className="flex h-screen bg-[#F5F5F4] text-[#1C1917] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 border-r border-[#E7E5E4] bg-white flex flex-col">
        <div className="p-6 border-bottom border-[#E7E5E4]">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">LingoCinema</h1>
          </div>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 bg-black text-white py-2.5 rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span className="text-sm font-medium">Upload Subtitle</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".srt,.vtt"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <p className="px-2 text-[11px] font-semibold text-[#78716C] uppercase tracking-wider mb-2">Your Library</p>
          {subtitles.map((sub) => (
            <div key={sub.id} className="group relative">
              <button
                onClick={() => setSelectedSubtitle(sub)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                  selectedSubtitle?.id === sub.id ? "bg-[#F5F5F4] text-black" : "text-[#57534E] hover:bg-[#FAFAF9]"
                )}
              >
                <FileText className={cn("w-4 h-4", selectedSubtitle?.id === sub.id ? "text-black" : "text-[#A8A29E]")} />
                <span className="text-sm font-medium truncate flex-1 pr-6">{sub.filename}</span>
                <ChevronRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity", selectedSubtitle?.id === sub.id && "opacity-100")} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSubtitle(sub.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#A8A29E] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {subtitles.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-[#A8A29E]">No subtitles uploaded yet.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {selectedSubtitle ? (
          <>
            {/* Header */}
            <header className="h-20 border-b border-[#E7E5E4] bg-white flex items-center justify-between px-8">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold truncate max-w-[300px]">{selectedSubtitle.filename}</h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider">Levels:</span>
                  <div className="flex gap-1">
                    {LEVELS.map(l => (
                      <button
                        key={l}
                        onClick={() => toggleLevel(l)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold transition-all",
                          selectedLevels.includes(l) 
                            ? "bg-black text-white" 
                            : "bg-[#F5F5F4] text-[#78716C] hover:bg-[#E7E5E4]"
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A29E]" />
                  <input 
                    type="text"
                    placeholder="Search words..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-1.5 bg-[#F5F5F4] border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-black/5 transition-all"
                  />
                </div>
                <button 
                  onClick={processSubtitle}
                  disabled={isProcessing}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {items.length > 0 ? 'Re-analyze' : 'Analyze Subtitle'}
                </button>
              </div>
            </header>

            {/* Grid Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Word List */}
              <div className="flex-1 overflow-y-auto p-8">
                {items.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence mode="popLayout">
                      {filteredItems.map((item) => (
                        <motion.button
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={item.id}
                          onClick={() => setActiveItem(item)}
                          className={cn(
                            "p-5 rounded-2xl border text-left transition-all group relative overflow-hidden",
                            activeItem?.id === item.id 
                              ? "bg-black text-white border-black shadow-xl" 
                              : "bg-white border-[#E7E5E4] hover:border-black/20 hover:shadow-sm"
                          )}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                              activeItem?.id === item.id 
                                ? "bg-white/20 text-white" 
                                : item.type === 'stage direction' || item.type === 'sound effect'
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-[#F5F5F4] text-[#78716C]"
                            )}>
                              {item.type}
                            </span>
                            <span className={cn(
                              "text-[10px] font-medium",
                              activeItem?.id === item.id ? "text-white/60" : "text-[#A8A29E]"
                            )}>
                              {item.frequency} Freq
                            </span>
                          </div>
                          <h3 className="text-lg font-bold mb-1">{item.term}</h3>
                          <p className={cn(
                            "text-sm line-clamp-2",
                            activeItem?.id === item.id ? "text-white/80" : "text-[#57534E]"
                          )}>
                            {item.meaning_zh}
                          </p>
                          <div className={cn(
                            "mt-4 flex items-center gap-2 text-[11px] font-medium",
                            activeItem?.id === item.id ? "text-white/40" : "text-[#A8A29E]"
                          )}>
                            <Volume2 className="w-3 h-3" />
                            {item.phonetic}
                          </div>
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                    <div className="w-16 h-16 bg-[#E7E5E4] rounded-full flex items-center justify-center mb-6">
                      <BookOpen className="w-8 h-8 text-[#A8A29E]" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">No items extracted yet</h3>
                    <p className="text-[#78716C] mb-8">
                      Click the "Analyze Subtitle" button to let AI identify key vocabulary, idioms, and grammar points from this file.
                    </p>
                    <button 
                      onClick={processSubtitle}
                      disabled={isProcessing}
                      className="bg-black text-white px-8 py-3 rounded-xl font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {isProcessing && <Loader2 className="w-5 h-5 animate-spin" />}
                      Start AI Analysis
                    </button>
                  </div>
                )}
              </div>

              {/* Detail Panel */}
              <AnimatePresence>
                {activeItem && (
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="w-[450px] bg-white border-l border-[#E7E5E4] shadow-2xl z-10 flex flex-col"
                  >
                    <div className="p-8 overflow-y-auto flex-1">
                          <div className="flex justify-between items-start mb-8">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-2 block">
                            {activeItem.level} Master Level
                          </span>
                          <h2 className="text-4xl font-bold tracking-tight mb-2">{activeItem.term}</h2>
                          <div className="flex items-center gap-3 text-[#78716C] mb-4">
                            <span className="text-sm font-medium italic">{activeItem.part_of_speech}</span>
                            <div className="w-1 h-1 bg-[#E7E5E4] rounded-full" />
                            <span className="text-sm font-mono">{activeItem.phonetic}</span>
                          </div>
                          
                          <div className="flex gap-2">
                            <button 
                              onClick={() => playAudio(activeItem.term, 'American')}
                              disabled={!!isPlayingAudio}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                                isPlayingAudio === 'American' 
                                  ? "bg-black text-white" 
                                  : "bg-[#F5F5F4] text-black hover:bg-[#E7E5E4]"
                              )}
                            >
                              {isPlayingAudio === 'American' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                              US Accent
                            </button>
                            <button 
                              onClick={() => playAudio(activeItem.term, 'British')}
                              disabled={!!isPlayingAudio}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                                isPlayingAudio === 'British' 
                                  ? "bg-black text-white" 
                                  : "bg-[#F5F5F4] text-black hover:bg-[#E7E5E4]"
                              )}
                            >
                              {isPlayingAudio === 'British' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                              UK Accent
                            </button>
                          </div>
                        </div>
                        <button 
                          onClick={() => setActiveItem(null)}
                          className="p-2 hover:bg-[#F5F5F4] rounded-full transition-colors"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </div>

                      <div className="space-y-8">
                        <section>
                          <div className="flex items-center gap-2 mb-3">
                            <Languages className="w-4 h-4 text-black" />
                            <h4 className="text-xs font-bold uppercase tracking-wider">Definitions</h4>
                          </div>
                          <div className="space-y-3">
                            <div className="p-4 bg-[#F5F5F4] rounded-2xl">
                              <p className="text-sm leading-relaxed font-medium">{activeItem.meaning_en}</p>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-2xl">
                              <p className="text-sm leading-relaxed text-emerald-900">{activeItem.meaning_zh}</p>
                            </div>
                          </div>
                        </section>

                        <section>
                          <div className="flex items-center gap-2 mb-3">
                            <Globe className="w-4 h-4 text-black" />
                            <h4 className="text-xs font-bold uppercase tracking-wider">Usage Scenarios</h4>
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm text-[#57534E] leading-relaxed">{activeItem.usage_scenarios_en}</p>
                            <p className="text-sm text-[#A8A29E] italic">{activeItem.usage_scenarios_zh}</p>
                          </div>
                        </section>

                        <section>
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-black" />
                            <h4 className="text-xs font-bold uppercase tracking-wider">Examples</h4>
                          </div>
                          <div className="space-y-4">
                            <div className="border-l-2 border-[#E7E5E4] pl-4 py-1">
                              <p className="text-sm font-medium mb-1">{activeItem.examples_en}</p>
                              <p className="text-xs text-[#78716C]">{activeItem.examples_zh}</p>
                            </div>
                          </div>
                        </section>

                        <section>
                          <div className="flex items-center gap-2 mb-3">
                            <Info className="w-4 h-4 text-black" />
                            <h4 className="text-xs font-bold uppercase tracking-wider">Details</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 border border-[#E7E5E4] rounded-2xl">
                              <p className="text-[10px] font-bold text-[#A8A29E] uppercase mb-1">Synonyms</p>
                              <p className="text-sm font-medium">{activeItem.synonyms || 'None listed'}</p>
                            </div>
                            <div className="p-4 border border-[#E7E5E4] rounded-2xl">
                              <p className="text-[10px] font-bold text-[#A8A29E] uppercase mb-1">Frequency</p>
                              <p className="text-sm font-medium">{activeItem.frequency}</p>
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-24 h-24 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-8 border border-[#E7E5E4]">
              <Upload className="w-10 h-10 text-black" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-4">Welcome to LingoCinema</h2>
            <p className="text-[#78716C] max-w-md mx-auto mb-10 leading-relaxed">
              Upload a movie or TV show subtitle file (.srt or .vtt) to start your personalized English learning journey. 
              Our AI will extract the most relevant vocabulary and grammar for your level.
            </p>
            <div className="grid grid-cols-3 gap-6 w-full max-w-2xl">
              {[
                { icon: BookOpen, title: 'AI Extraction', desc: 'Idioms, slangs & collocations' },
                { icon: Layers, title: 'CEFR Levels', desc: 'A1 to C2 mastery tracking' },
                { icon: Languages, title: 'Bilingual', desc: 'English & Chinese support' }
              ].map((feature, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-[#E7E5E4] shadow-sm">
                  <feature.icon className="w-6 h-6 mb-3 text-black" />
                  <h4 className="text-sm font-bold mb-1">{feature.title}</h4>
                  <p className="text-xs text-[#78716C]">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
