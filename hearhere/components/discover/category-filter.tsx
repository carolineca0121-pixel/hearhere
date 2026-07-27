"use client";

import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  isContentCategory,
} from "@/lib/content";
import type { ContentCategory } from "@/lib/types";

interface CategoryFilterProps {
  selectedCategories: ContentCategory[];
  onChange: (categories: ContentCategory[]) => void;
}

const ALL_CATEGORIES: ContentCategory[] = [
  "attraction",
  "food",
  "souvenir",
  "culture",
  "photo",
  "lifestyle",
  "hidden",
];

export function CategoryFilter({
  selectedCategories,
  onChange,
}: CategoryFilterProps) {
  const toggleCategory = (category: ContentCategory) => {
    if (selectedCategories.includes(category)) {
      onChange(selectedCategories.filter((c) => c !== category));
    } else {
      onChange([...selectedCategories, category]);
    }
  };

  const selectAll = () => {
    onChange(ALL_CATEGORIES);
  };

  const selectNone = () => {
    onChange([]);
  };

  const isAllSelected = selectedCategories.length === ALL_CATEGORIES.length;
  const isNoneSelected = selectedCategories.length === 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">内容分类</span>
        <div className="flex gap-2">
          <button
            onClick={isAllSelected ? selectNone : selectAll}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {isAllSelected ? "取消全选" : "全选"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL_CATEGORIES.map((category) => {
          const isSelected = selectedCategories.includes(category);
          const color = CATEGORY_COLORS[category];
          const label = CATEGORY_LABELS[category];

          return (
            <button
              key={category}
              onClick={() => toggleCategory(category)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all",
                isSelected
                  ? "text-white shadow-md"
                  : "bg-white/70 text-gray-600 hover:bg-white"
              )}
              style={{
                backgroundColor: isSelected ? color : undefined,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
