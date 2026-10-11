import { describe, it, expect } from 'vitest';
import { 
  getItemTier, 
  sortItems, 
  groupItemsByTier 
} from './sorting.js';

describe('getItemTier', () => {
  it('correctly maps standard Tier labels', () => {
    expect(getItemTier('Tier 1')).toBe(1);
    expect(getItemTier('Tier 2')).toBe(2);
    expect(getItemTier('Tier 3')).toBe(3);
    expect(getItemTier('Tier 4')).toBe(4);
  });

  it('correctly maps Tier labels with descriptive suffixes', () => {
    expect(getItemTier('Tier 1: Core High-Frequency Idioms & Expressions')).toBe(1);
    expect(getItemTier('tier 2 - advanced vocabulary')).toBe(2);
    expect(getItemTier('TIER 3 (Academic)')).toBe(3);
    expect(getItemTier('Tier 4 (Literary)')).toBe(4);
  });

  it('maps legacy frequency strings to corresponding tiers', () => {
    expect(getItemTier('High')).toBe(1);
    expect(getItemTier('Medium')).toBe(2);
    expect(getItemTier('Low')).toBe(4);
  });

  it('handles edge cases, unrecognized strings, and empty values', () => {
    expect(getItemTier('')).toBe(5);
    expect(getItemTier(undefined)).toBe(5);
    expect(getItemTier('unknown')).toBe(5);
  });
});

describe('sortItems', () => {
  const sampleItems = [
    { id: 10, term: 'grisly', frequency: 'Tier 4' },
    { id: 2, term: 'crack it', frequency: 'Tier 1' },
    { id: 5, term: 'substantiate', frequency: 'Tier 2' },
    { id: 1, term: 'solicitor', frequency: 'Tier 3' },
    { id: 8, term: 'rock up', frequency: 'Tier 1' },
    { id: 3, term: 'vanished', frequency: 'Tier 2' },
  ];

  it('sorts chronologically by id ascending (appearance order)', () => {
    const sorted = sortItems(sampleItems, 'chronological');
    expect(sorted.map(i => i.id)).toEqual([1, 2, 3, 5, 8, 10]);
  });

  it('sorts by importance tier first, and by chronological id within the same tier', () => {
    const sorted = sortItems(sampleItems, 'importance');
    expect(sorted.map(i => i.term)).toEqual([
      'crack it',      // Tier 1, id 2
      'rock up',       // Tier 1, id 8
      'vanished',      // Tier 2, id 3
      'substantiate',  // Tier 2, id 5
      'solicitor',     // Tier 3, id 1
      'grisly',        // Tier 4, id 10
    ]);
  });

  it('does not mutate original items array', () => {
    const copy = [...sampleItems];
    sortItems(sampleItems, 'importance');
    expect(sampleItems).toEqual(copy);
  });
});

describe('groupItemsByTier', () => {
  it('groups items into ordered tier buckets with metadata and item counts', () => {
    const items = [
      { id: 2, term: 'crack it', frequency: 'Tier 1' },
      { id: 5, term: 'substantiate', frequency: 'Tier 2' },
      { id: 8, term: 'rock up', frequency: 'Tier 1' },
      { id: 10, term: 'grisly', frequency: 'Tier 4' },
    ];

    const groups = groupItemsByTier(items);

    expect(groups.length).toBe(3); // Tier 1, Tier 2, Tier 4
    expect(groups[0].tier).toBe(1);
    expect(groups[0].items.length).toBe(2);
    expect(groups[0].definition.label).toContain('Tier 1');

    expect(groups[1].tier).toBe(2);
    expect(groups[1].items.length).toBe(1);

    expect(groups[2].tier).toBe(4);
    expect(groups[2].items.length).toBe(1);
  });

  it('returns empty array when input is empty', () => {
    expect(groupItemsByTier([])).toEqual([]);
  });
});
