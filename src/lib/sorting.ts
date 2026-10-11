export type OrderMode = 'chronological' | 'importance';

export interface TierDefinition {
  tier: number;
  name: string;
  label: string;
  description: string;
  badgeClass: string;
}

export const TIER_DEFINITIONS: Record<number, TierDefinition> = {
  1: {
    tier: 1,
    name: 'Core High-Frequency Idioms & Expressions',
    label: 'Tier 1: Core High-Frequency Idioms & Expressions',
    description: 'Crucial for authentic daily spoken English',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  2: {
    tier: 2,
    name: 'High-Frequency Advanced Vocabulary',
    label: 'Tier 2: High-Frequency Advanced Vocabulary',
    description: 'Enhances fluency, reading comprehension, and richness of expression',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  3: {
    tier: 3,
    name: 'Professional, Academic & Specific Context Words',
    label: 'Tier 3: Professional, Academic & Specific Context Words',
    description: 'Workplace, legal, medical, technical, or specific domain terms',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  4: {
    tier: 4,
    name: 'Literary, Obscure, and Audio Cues',
    label: 'Tier 4: Literary, Obscure, and Stage Directions/Background Audio',
    description: 'Literary words, slang, stage directions, and audio cues',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  5: {
    tier: 5,
    name: 'Other Extracted Items',
    label: 'Other',
    description: 'Uncategorized frequency or miscellaneous items',
    badgeClass: 'bg-stone-100 text-stone-800 border-stone-200',
  },
};

/**
 * Normalizes an item's frequency string into a numeric tier (1 to 4, or 5 for other).
 */
export function getItemTier(frequency?: string): number {
  if (!frequency) return 5;
  const match = frequency.match(/Tier\s*(\d)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 4) return num;
  }
  const lower = frequency.toLowerCase();
  if (lower.includes('high')) return 1;
  if (lower.includes('medium')) return 2;
  if (lower.includes('low')) return 4;
  return 5;
}

/**
 * Sorts items either chronologically by insertion id or by importance tier (with chronological secondary sort).
 */
export function sortItems<T extends { id: number; frequency: string }>(
  items: T[],
  mode: OrderMode
): T[] {
  const result = [...items];
  if (mode === 'chronological') {
    return result.sort((a, b) => a.id - b.id);
  }
  return result.sort((a, b) => {
    const tierA = getItemTier(a.frequency);
    const tierB = getItemTier(b.frequency);
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    return a.id - b.id;
  });
}

/**
 * Groups items into tier buckets (1 to 5) for sectioned display.
 */
export function groupItemsByTier<T extends { id: number; frequency: string }>(
  items: T[]
): { tier: number; definition: TierDefinition; items: T[] }[] {
  const map = new Map<number, T[]>();

  for (const item of items) {
    const tier = getItemTier(item.frequency);
    if (!map.has(tier)) {
      map.set(tier, []);
    }
    map.get(tier)!.push(item);
  }

  const sortedTiers = Array.from(map.keys()).sort((a, b) => a - b);
  return sortedTiers.map((tier) => ({
    tier,
    definition: TIER_DEFINITIONS[tier] || TIER_DEFINITIONS[5],
    items: map.get(tier)!,
  }));
}
