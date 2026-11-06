import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  analyzeSubtitleListening,
  fetchDifficultyExamples,
  fetchListeningDifficulties,
  regenerateDifficultyExamples,
  updateDifficultyMastery,
} from '../api/listening.js';
import type {
  AccentCode,
  ListeningDifficultyRecord,
  ListeningExampleRecord,
  PhoneticCategory,
  PlaybackSpeedPreset,
} from '../types/listening.js';

export type ExampleLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ExplanationLanguage = 'zh' | 'en';

interface StoredListeningPreferences {
  defaultAccent: AccentCode;
  defaultSpeed: PlaybackSpeedPreset;
  explanationLang: ExplanationLanguage;
  blindListen: boolean;
}

const PREFS_STORAGE_KEY = 'lingocinema.listening.preferences.v1';

const DEFAULT_COUNTS: Record<PhoneticCategory, number> = {
  catenation: 0,
  assimilation: 0,
  elision: 0,
  weak_forms: 0,
  h_dropping: 0,
  contractions: 0,
  confusion: 0,
};

function readStoredPreferences(): StoredListeningPreferences {
  try {
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem(PREFS_STORAGE_KEY) : null;
    if (!raw) {
      return {
        defaultAccent: 'uk',
        defaultSpeed: 'normal',
        explanationLang: 'zh',
        blindListen: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredListeningPreferences>;
    return {
      defaultAccent: parsed.defaultAccent ?? 'uk',
      defaultSpeed: parsed.defaultSpeed ?? 'normal',
      explanationLang: parsed.explanationLang ?? 'zh',
      blindListen: Boolean(parsed.blindListen),
    };
  } catch {
    return {
      defaultAccent: 'uk',
      defaultSpeed: 'normal',
      explanationLang: 'zh',
      blindListen: false,
    };
  }
}

export function useListeningDifficulties(subtitleId: number | null) {
  const [items, setItems] = useState<ListeningDifficultyRecord[]>([]);
  const [countsByCategory, setCountsByCategory] =
    useState<Record<PhoneticCategory, number>>(DEFAULT_COUNTS);
  const [selectedCategory, setSelectedCategory] = useState<PhoneticCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [hideMastered, setHideMastered] = useState<boolean>(false);
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<number | null>(null);

  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  const [examplesByDifficultyId, setExamplesByDifficultyId] = useState<
    Record<number, ListeningExampleRecord[]>
  >({});
  const [exampleStatusById, setExampleStatusById] = useState<Record<number, ExampleLoadStatus>>({});
  const [exampleErrorById, setExampleErrorById] = useState<Record<number, string>>({});

  const [prefs, setPrefs] = useState<StoredListeningPreferences>(readStoredPreferences);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [prefs]);

  const setDefaultAccent = useCallback((defaultAccent: AccentCode) => {
    setPrefs((prev) => ({ ...prev, defaultAccent }));
  }, []);

  const setDefaultSpeed = useCallback((defaultSpeed: PlaybackSpeedPreset) => {
    setPrefs((prev) => ({ ...prev, defaultSpeed }));
  }, []);

  const setExplanationLang = useCallback((explanationLang: ExplanationLanguage) => {
    setPrefs((prev) => ({ ...prev, explanationLang }));
  }, []);

  const setBlindListen = useCallback((blindListen: boolean) => {
    setPrefs((prev) => ({ ...prev, blindListen }));
  }, []);

  const loadDifficulties = useCallback(async (targetSubtitleId: number) => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const res = await fetchListeningDifficulties(targetSubtitleId, {
        includeMastered: true,
      });
      setItems(res.items);
      setCountsByCategory(res.countsByCategory);
      setSelectedDifficultyId((prev) => {
        if (prev && res.items.some((i) => i.id === prev)) {
          return prev;
        }
        return res.items[0]?.id ?? null;
      });
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load listening difficulties');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (subtitleId !== null) {
        void loadDifficulties(subtitleId);
      } else {
        setItems([]);
        setCountsByCategory(DEFAULT_COUNTS);
        setSelectedDifficultyId(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDifficulties, subtitleId]);

  const loadExamplesForDifficulty = useCallback(
    async (difficultyId: number, autoGenerate = true) => {
      setExampleStatusById((prev) => ({ ...prev, [difficultyId]: 'loading' }));
      setExampleErrorById((prev) => {
        const next = { ...prev };
        delete next[difficultyId];
        return next;
      });

      try {
        const res = await fetchDifficultyExamples(difficultyId, { autoGenerate });
        setExamplesByDifficultyId((prev) => ({ ...prev, [difficultyId]: res.examples }));
        setExampleStatusById((prev) => ({ ...prev, [difficultyId]: 'ready' }));
        setItems((prev) =>
          prev.map((item) =>
            item.id === difficultyId ? { ...item, examples_count: res.examples.length } : item
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load examples';
        setExampleErrorById((prev) => ({ ...prev, [difficultyId]: msg }));
        setExampleStatusById((prev) => ({ ...prev, [difficultyId]: 'error' }));
      }
    },
    []
  );

  // Lazily load/generate B1 examples when a difficulty card is selected
  useEffect(() => {
    if (selectedDifficultyId === null) return;
    const status = exampleStatusById[selectedDifficultyId];
    if (!status || status === 'idle') {
      const targetId = selectedDifficultyId;
      const timer = setTimeout(() => {
        void loadExamplesForDifficulty(targetId, true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [exampleStatusById, loadExamplesForDifficulty, selectedDifficultyId]);

  const analyzeDifficulties = useCallback(
    async (force = true) => {
      if (subtitleId === null) return;
      setIsAnalyzing(true);
      setListError(null);
      try {
        const res = await analyzeSubtitleListening(subtitleId, { force });
        setItems(res.items);
        setExamplesByDifficultyId({});
        setExampleStatusById({});
        await loadDifficulties(subtitleId);
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to analyze listening traps');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [loadDifficulties, subtitleId]
  );

  const regenerateExamples = useCallback(async (difficultyId: number) => {
    setExampleStatusById((prev) => ({ ...prev, [difficultyId]: 'loading' }));
    setExampleErrorById((prev) => {
      const next = { ...prev };
      delete next[difficultyId];
      return next;
    });

    try {
      const res = await regenerateDifficultyExamples(difficultyId);
      setExamplesByDifficultyId((prev) => ({ ...prev, [difficultyId]: res.examples }));
      setExampleStatusById((prev) => ({ ...prev, [difficultyId]: 'ready' }));
      setItems((prev) =>
        prev.map((item) =>
          item.id === difficultyId ? { ...item, examples_count: res.examples.length } : item
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate examples';
      setExampleErrorById((prev) => ({ ...prev, [difficultyId]: msg }));
      setExampleStatusById((prev) => ({ ...prev, [difficultyId]: 'error' }));
    }
  }, []);

  const toggleMastery = useCallback(async (difficultyId: number, isMastered: boolean) => {
    const res = await updateDifficultyMastery(difficultyId, isMastered);
    setItems((prev) =>
      prev.map((item) =>
        item.id === difficultyId ? { ...item, is_mastered: res.isMastered } : item
      )
    );
  }, []);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      if (hideMastered && item.is_mastered) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (!query) return true;
      return (
        item.phrase.toLowerCase().includes(query) ||
        item.spoken_phrase.toLowerCase().includes(query) ||
        item.simulated_pronunciation.toLowerCase().includes(query) ||
        item.original_sentence.toLowerCase().includes(query) ||
        item.explanation_zh.toLowerCase().includes(query) ||
        item.explanation_en.toLowerCase().includes(query)
      );
    });
  }, [hideMastered, items, searchTerm, selectedCategory]);

  const selectedDifficulty = useMemo(
    () => items.find((i) => i.id === selectedDifficultyId) ?? null,
    [items, selectedDifficultyId]
  );

  return {
    items,
    filteredItems,
    countsByCategory,
    selectedCategory,
    setSelectedCategory,
    searchTerm,
    setSearchTerm,
    hideMastered,
    setHideMastered,
    selectedDifficulty,
    setSelectedDifficultyId,
    isLoadingList,
    isAnalyzing,
    listError,
    examplesByDifficultyId,
    exampleStatusById,
    exampleErrorById,
    defaultAccent: prefs.defaultAccent,
    setDefaultAccent,
    defaultSpeed: prefs.defaultSpeed,
    setDefaultSpeed,
    explanationLang: prefs.explanationLang,
    setExplanationLang,
    blindListen: prefs.blindListen,
    setBlindListen,
    loadDifficulties,
    analyzeDifficulties,
    loadExamplesForDifficulty,
    regenerateExamples,
    toggleMastery,
  };
}
