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
  Trash2,
  Settings,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

type ProviderConfig = {
  textProvider: string;
  ttsProvider: string;
  geminiTextModel: string;
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
  hasGeminiKey: boolean;
  hasOpenaiKey: boolean;
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ─── Settings Panel Component ───────────────────────────────────────────

function SettingsPanel({ 
  isOpen, 
  onClose, 
  config, 
  onSave 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  config: ProviderConfig | null;
  onSave: (updates: Partial<ProviderConfig>) => void;
}) {
  const [localConfig, setLocalConfig] = useState<Partial<ProviderConfig>>({});

  useEffect(() => {
    if (config) setLocalConfig({ ...config });
  }, [config]);

  if (!isOpen || !config) return null;

  const update = (key: string, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b border-[#E7E5E4]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-lg font-bold">Provider Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F5F5F4] rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Text LLM Provider */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#78716C] mb-3">Text LLM Provider</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { id: 'gemini', label: 'Gemini', available: config.hasGeminiKey },
                { id: 'openai', label: 'OpenAI', available: config.hasOpenaiKey },
                { id: 'ollama', label: 'Ollama', available: true },
                { id: 'llamacpp', label: 'llama.cpp', available: true },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => update('textProvider', p.id)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                    localConfig.textProvider === p.id
                      ? "bg-black text-white border-black"
                      : "bg-white text-[#57534E] border-[#E7E5E4] hover:border-black/20",
                    !p.available && "opacity-40"
                  )}
                >
                  {p.label}
                  {!p.available && <span className="block text-[9px] mt-0.5 opacity-70">No API Key</span>}
                </button>
              ))}
            </div>

            {/* Provider-specific model config */}
            {localConfig.textProvider === 'gemini' && (
              <div>
                <label className="text-xs text-[#A8A29E] block mb-1">Model</label>
                <input
                  type="text"
                  value={localConfig.geminiTextModel || ''}
                  onChange={e => update('geminiTextModel', e.target.value)}
                  className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                />
              </div>
            )}
            {localConfig.textProvider === 'openai' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">Model</label>
                  <input
                    type="text"
                    value={localConfig.openaiTextModel || ''}
                    onChange={e => update('openaiTextModel', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">Base URL</label>
                  <input
                    type="text"
                    value={localConfig.openaiBaseUrl || ''}
                    onChange={e => update('openaiBaseUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
              </div>
            )}
            {localConfig.textProvider === 'ollama' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">Model</label>
                  <input
                    type="text"
                    value={localConfig.ollamaTextModel || ''}
                    onChange={e => update('ollamaTextModel', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">Ollama URL</label>
                  <input
                    type="text"
                    value={localConfig.ollamaBaseUrl || ''}
                    onChange={e => update('ollamaBaseUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
              </div>
            )}
            {localConfig.textProvider === 'llamacpp' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">Model (optional)</label>
                  <input
                    type="text"
                    value={localConfig.llamacppTextModel || ''}
                    onChange={e => update('llamacppTextModel', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">llama.cpp Base URL</label>
                  <input
                    type="text"
                    value={localConfig.llamacppBaseUrl || ''}
                    onChange={e => update('llamacppBaseUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
              </div>
            )}
          </section>

          {/* TTS Provider */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#78716C] mb-3">TTS Provider</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { id: 'gemini', label: 'Gemini', available: config.hasGeminiKey },
                { id: 'openai', label: 'OpenAI', available: config.hasOpenaiKey },
                { id: 'piper', label: 'Piper (Local)', available: true },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => update('ttsProvider', p.id)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                    localConfig.ttsProvider === p.id
                      ? "bg-black text-white border-black"
                      : "bg-white text-[#57534E] border-[#E7E5E4] hover:border-black/20",
                    !p.available && "opacity-40"
                  )}
                >
                  {p.label}
                  {!p.available && <span className="block text-[9px] mt-0.5 opacity-70">No API Key</span>}
                </button>
              ))}
            </div>

            {localConfig.ttsProvider === 'gemini' && (
              <div>
                <label className="text-xs text-[#A8A29E] block mb-1">TTS Model</label>
                <input
                  type="text"
                  value={localConfig.geminiTtsModel || ''}
                  onChange={e => update('geminiTtsModel', e.target.value)}
                  className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                />
              </div>
            )}
            {localConfig.ttsProvider === 'piper' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">Piper Binary Path</label>
                  <input
                    type="text"
                    value={localConfig.piperBinaryPath || ''}
                    onChange={e => update('piperBinaryPath', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#A8A29E] block mb-1">Model Path</label>
                  <input
                    type="text"
                    value={localConfig.piperModelPath || ''}
                    onChange={e => update('piperModelPath', e.target.value)}
                    className="w-full px-3 py-2 bg-[#F5F5F4] rounded-lg text-sm border-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
                <div className="p-3 bg-amber-50 rounded-xl">
                  <p className="text-xs text-amber-800">
                    Piper must be installed locally. See <strong>docs/LOCAL_DEPLOYMENT.md</strong> for setup instructions.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="p-6 border-t border-[#E7E5E4] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-medium text-[#57534E] hover:bg-[#F5F5F4] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-black text-white hover:bg-zinc-800 transition-all"
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────

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
  const [showSettings, setShowSettings] = useState(false);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSubtitles();
    fetchConfig();
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

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setProviderConfig(data);
    } catch (err) {
      console.error('Failed to fetch config', err);
    }
  };

  const saveConfig = async (updates: Partial<ProviderConfig>) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.config) setProviderConfig(data.config);
    } catch (err) {
      console.error('Failed to save config', err);
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

  // ── TTS via backend API ──
  const playAudio = async (text: string, accent: 'British' | 'American') => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(accent);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: accent }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'TTS request failed');
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsPlayingAudio(null);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
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

  // ── Analyze via backend API ──
  const processSubtitle = async () => {
    if (!selectedSubtitle) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitleId: selectedSubtitle.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const result = await res.json();
      console.log(`Analysis complete: ${result.count} items extracted via ${result.provider}`);
      await fetchItems(selectedSubtitle.id, selectedLevels);
    } catch (err: any) {
      console.error('Processing failed', err);
      alert(`AI Processing failed: ${err.message}`);
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
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            config={providerConfig}
            onSave={saveConfig}
          />
        )}
      </AnimatePresence>

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

        {/* Settings button at bottom of sidebar */}
        <div className="p-4 border-t border-[#E7E5E4]">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[#57534E] hover:bg-[#F5F5F4] transition-all"
          >
            <Settings className="w-4 h-4 text-[#A8A29E]" />
            <span className="text-sm font-medium">Provider Settings</span>
            {providerConfig && (
              <span className="ml-auto text-[10px] font-bold text-[#A8A29E] uppercase">
                {providerConfig.textProvider}
              </span>
            )}
          </button>
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
