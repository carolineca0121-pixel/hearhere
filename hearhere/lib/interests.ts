/**
 * 首页兴趣发现 — 预设标签数据
 *
 * 每个兴趣类别包含预设的标签，用户点击后直接带入推荐流。
 */

import type { ExtractedTags } from "@/lib/types";

export interface InterestPreset {
  id: string;
  emoji: string;
  label: string;
  subLabel: string;
  tags: ExtractedTags;
  /** 对应的 discover 页预设城市（用于地图搜索） */
  sampleDestinations: string[];
}

export const INTEREST_PRESETS: InterestPreset[] = [
  {
    id: "history",
    emoji: "🏛️",
    label: "人文历史",
    subLabel: "古迹、博物馆、老街",
    tags: {
      preferences: ["历史文化", "博物馆", "古迹"],
      constraints: [],
      conflicts: [],
    },
    sampleDestinations: ["西安", "北京", "洛阳", "南京", "平遥"],
  },
  {
    id: "ocean",
    emoji: "🌊",
    label: "看海发呆",
    subLabel: "海边、日落、放空",
    tags: {
      preferences: ["看海", "发呆放松", "海边日落", "不赶路"],
      constraints: [],
      conflicts: [],
    },
    sampleDestinations: ["三亚", "厦门", "青岛", "威海", "东山岛"],
  },
  {
    id: "food",
    emoji: "🍜",
    label: "吃遍美食",
    subLabel: "地道小吃、排队老店",
    tags: {
      preferences: ["美食探索", "本地特色", "小吃", "排队也值"],
      constraints: [],
      conflicts: [],
    },
    sampleDestinations: ["成都", "顺德", "潮汕", "重庆", "长沙"],
  },
  {
    id: "hiking",
    emoji: "⛰️",
    label: "徒步爬山",
    subLabel: "户外、登顶、日出",
    tags: {
      preferences: ["徒步", "爬山", "户外", "自然风光"],
      constraints: [],
      conflicts: [],
    },
    sampleDestinations: ["黄山", "武功山", "四姑娘山", "虎跳峡", "泰山"],
  },
  {
    id: "photo",
    emoji: "📸",
    label: "拍照打卡",
    subLabel: "出片、氛围感、小众",
    tags: {
      preferences: ["拍照出片", "氛围感", "小众地", "咖啡馆"],
      constraints: [],
      conflicts: [],
    },
    sampleDestinations: ["阿那亚", "松阳", "霞浦", "景德镇", "大理"],
  },
  {
    id: "surprise",
    emoji: "✨",
    label: "随缘推荐",
    subLabel: "帮我选，去哪都行",
    tags: {
      preferences: ["惊喜探索", "开放心态"],
      constraints: [],
      conflicts: [],
    },
    sampleDestinations: ["大理", "莫干山", "腾冲", "婺源", "涠洲岛"],
  },
];

/** 所有兴趣的样本目的地池（Surprise Me 随机抽取） */
export const ALL_DESTINATIONS = INTEREST_PRESETS.flatMap((p) => p.sampleDestinations);

/** 热门目的地：跨类别的精选目的地，给"我有目标"型用户快速选择 */
export const POPULAR_DESTINATIONS = [
  "普陀山", "厦门", "成都", "西安", "三亚", "杭州", "大理", "黄山", "长沙", "重庆",
];

/** 每个兴趣随机选一个预设目的地（页面加载时确定，避免切换闪烁） */
export function pickDestination(interest: InterestPreset): string {
  const pool = interest.sampleDestinations;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 从池子中随机选3个不重复的示例目的地 */
export function pickSamples(interest: InterestPreset, count = 3): string[] {
  const pool = [...interest.sampleDestinations];
  // Fisher-Yates shuffle then take first count
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/** Surprise Me：从全部池子里随机 */
export function pickSurprise(): InterestPreset {
  return INTEREST_PRESETS[Math.floor(Math.random() * INTEREST_PRESETS.length)];
}
