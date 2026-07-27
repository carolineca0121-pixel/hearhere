import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ExtractedTags,
  HarmonyResult,
  InsightCard,
  ContentCard,
  BuilderState,
  ContentCategory,
} from "@/lib/types";

interface SessionState {
  _hydrated: boolean;  // persist 中间件 hydration 完成标记
  transcript: string;
  refinedTranscript: string;
  tags: ExtractedTags | null;
  harmony: HarmonyResult | null;
  insightCards: InsightCard[];
  selectedCards: InsightCard[];
  foodCards: InsightCard[];
  selectedFoods: InsightCard[];

  // ========== 新增状态 ==========
  contentCards: ContentCard[];
  selectedContent: ContentCard[];
  builderState: BuilderState | null;
  currentDiscoverMode: "feed" | "map" | "interests";

  setTranscript: (t: string) => void;
  setRefinedTranscript: (t: string) => void;
  setTags: (tags: ExtractedTags | null) => void;
  setHarmony: (h: HarmonyResult | null) => void;
  setInsightCards: (cards: InsightCard[]) => void;
  addSelectedCard: (card: InsightCard) => void;
  removeSelectedCard: (id: string) => void;
  setFoodCards: (cards: InsightCard[]) => void;
  addSelectedFood: (card: InsightCard) => void;
  removeSelectedFood: (id: string) => void;

  // ========== 新增方法 ==========
  setContentCards: (cards: ContentCard[]) => void;
  addContentCard: (card: ContentCard) => void;
  removeContentCard: (id: string) => void;
  setBuilderState: (state: BuilderState | null) => void;
  setCurrentDiscoverMode: (mode: "feed" | "map" | "interests") => void;
  addContentToBuilder: (card: ContentCard) => void;
  removeContentFromBuilder: (cardId: string) => void;

  reset: () => void;
}

const emptyTags = (): ExtractedTags => ({
  preferences: [],
  constraints: [],
  conflicts: [],
});

// 创建空的BuilderState
const createEmptyBuilderState = (days: number = 3): BuilderState => {
  const slots: any[] = [];
  for (let day = 0; day < days; day++) {
    slots.push({
      id: `day-${day}-morning`,
      dayIndex: day,
      slot: "morning" as const,
    });
    slots.push({
      id: `day-${day}-afternoon`,
      dayIndex: day,
      slot: "afternoon" as const,
    });
    slots.push({
      id: `day-${day}-evening`,
      dayIndex: day,
      slot: "evening" as const,
    });
  }
  return {
    days,
    slots,
    conflicts: [],
    selectedCategories: ["attraction", "food", "souvenir"],
  };
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      _hydrated: false,
      transcript: "",
      refinedTranscript: "",
      tags: null,
      harmony: null,
      insightCards: [],
      selectedCards: [],
      foodCards: [],
      selectedFoods: [],

      // ========== 新增状态 ==========
      contentCards: [],
      selectedContent: [],
      builderState: null,
      currentDiscoverMode: "feed",

      setTranscript: (transcript) => set({ transcript }),
      setRefinedTranscript: (refinedTranscript) => set({ refinedTranscript }),
      setTags: (tags) => {
        // 当设置tags时，初始化builderState
        const days = tags?.days || 3;
        set({
          tags,
          builderState: createEmptyBuilderState(days),
        });
      },
      setHarmony: (harmony) => set({ harmony }),
      setInsightCards: (insightCards) => set({ insightCards }),
      addSelectedCard: (card) =>
        set((s) => ({
          selectedCards: s.selectedCards.some((c) => c.id === card.id)
            ? s.selectedCards
            : [...s.selectedCards, card],
        })),
      removeSelectedCard: (id) =>
        set((s) => ({
          selectedCards: s.selectedCards.filter((c) => c.id !== id),
        })),
      setFoodCards: (foodCards) => set({ foodCards }),
      addSelectedFood: (card) =>
        set((s) => ({
          selectedFoods: s.selectedFoods.some((c) => c.id === card.id)
            ? s.selectedFoods
            : [...s.selectedFoods, card],
        })),
      removeSelectedFood: (id) =>
        set((s) => ({
          selectedFoods: s.selectedFoods.filter((c) => c.id !== id),
        })),

      // ========== 新增方法 ==========
      setContentCards: (contentCards) => set({ contentCards }),
      addContentCard: (card) =>
        set((s) => {
          // 更新卡片状态为selected
          const updatedContentCards = s.contentCards.map((c) =>
            c.id === card.id ? { ...c, status: "selected" as const } : c
          );
          // 添加到selectedContent（如果不存在）
          const updatedSelectedContent = s.selectedContent.some((c) => c.id === card.id)
            ? s.selectedContent
            : [...s.selectedContent, { ...card, status: "selected" as const }];
          return {
            contentCards: updatedContentCards,
            selectedContent: updatedSelectedContent,
          };
        }),
      removeContentCard: (id) =>
        set((s) => {
          // 更新卡片状态为available
          const updatedContentCards = s.contentCards.map((c) =>
            c.id === id ? { ...c, status: "available" as const } : c
          );
          // 从selectedContent中移除
          const updatedSelectedContent = s.selectedContent.filter((c) => c.id !== id);
          return {
            contentCards: updatedContentCards,
            selectedContent: updatedSelectedContent,
          };
        }),
      setBuilderState: (builderState) => set({ builderState }),
      setCurrentDiscoverMode: (currentDiscoverMode) => set({ currentDiscoverMode }),
      addContentToBuilder: (card) =>
        set((s) => {
          // 更新卡片状态
          const updatedContentCards = s.contentCards.map((c) =>
            c.id === card.id ? { ...c, status: "scheduled" as const } : c
          );
          const updatedSelectedContent = s.selectedContent.map((c) =>
            c.id === card.id ? { ...c, status: "scheduled" as const } : c
          );
          return {
            contentCards: updatedContentCards,
            selectedContent: updatedSelectedContent,
          };
        }),
      removeContentFromBuilder: (cardId) =>
        set((s) => {
          // 更新卡片状态回selected
          const updatedContentCards = s.contentCards.map((c) =>
            c.id === cardId ? { ...c, status: "selected" as const } : c
          );
          const updatedSelectedContent = s.selectedContent.map((c) =>
            c.id === cardId ? { ...c, status: "selected" as const } : c
          );
          return {
            contentCards: updatedContentCards,
            selectedContent: updatedSelectedContent,
          };
        }),

      reset: () =>
        set({
          _hydrated: true,
          transcript: "",
          refinedTranscript: "",
          tags: null,
          harmony: null,
          insightCards: [],
          selectedCards: [],
          foodCards: [],
          selectedFoods: [],
          contentCards: [],
          selectedContent: [],
          builderState: null,
          currentDiscoverMode: "feed",
        }),
    }),
    {
      name: "hearhere-session-v5",
      // persisted state FIRST, current state overrides — prevents stale
      // localStorage data from overwriting freshly-set in-memory values
      merge: (persistedState: any, currentState) => ({
        ...currentState,     // defaults
        ...persistedState,   // localStorage overrides defaults
        _hydrated: true,
      }),
    }
  )
);

export { emptyTags, createEmptyBuilderState };
