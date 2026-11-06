import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  LISTENING_CATEGORIES,
  type CategoryOption,
} from '../../lib/phoneticHighlighter.js';
import type { PhoneticCategory } from '../../types/listening.js';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CategoryFilterBarProps {
  categories?: CategoryOption[];
  selectedCategory: PhoneticCategory | 'all';
  onSelectCategory: (category: PhoneticCategory | 'all') => void;
  countsByCategory: Record<PhoneticCategory, number>;
  totalCount: number;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  categories = LISTENING_CATEGORIES,
  selectedCategory,
  onSelectCategory,
  countsByCategory,
  totalCount,
}) => {
  return (
    <div className="bg-white border-b border-[#E7E5E4] px-4 sm:px-8 py-2 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-1.5 min-w-max">
        {categories.map((cat) => {
          const count = cat.key === 'all' ? totalCount : (countsByCategory[cat.key] ?? 0);
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onSelectCategory(cat.key)}
              className={cn(
                'min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0',
                isSelected
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-[#F5F5F4] text-[#78716C] hover:bg-[#E7E5E4] hover:text-black'
              )}
            >
              <span>{cat.label}</span>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-mono',
                  isSelected ? 'bg-white/20 text-white' : 'bg-white text-[#78716C]'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
