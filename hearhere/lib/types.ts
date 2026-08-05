export type VibeTheme = "sea" | "forest" | "dusk";

// ========== 内容分类系统 ==========
export type ContentCategory =
  | "attraction"      // 景点
  | "food"            // 美食
  | "souvenir"        // 文创纪念品
  | "culture"         // 历史文化背景
  | "photo"           // 拍照打卡点
  | "lifestyle"       // 本地生活方式
  | "hidden";         // 隐藏玩法/小众体验

// ========== 时间轴时段 ==========
export type TimeSlot = "morning" | "afternoon" | "evening";

export interface ExtractedTags {
  destination?: string;
  departure?: string;
  tripType?: string;
  peopleCount?: number;
  days?: number;
  transportation?: string;
  budget?: string;
  dates?: string;
  preferences: string[];
  constraints: string[];
  conflicts: string[];
  groupMode?: boolean;
  // ── 行程细节（第二页确认） ──
  departureTime?: string;    // 出发时间: "早上" | "中午" | "下午"
  returnTime?: string;       // 返程偏好: "午饭后" | "一早"
  hotelStatus?: string;      // 酒店: "已定" | "需要推荐"
}

export interface HarmonyResult {
  summary: string;
  resolutions: string[];
  scheduleHints: string[];
}

export interface InsightCard {
  id: string;
  title: string;
  review: string;
  reason: string;
  imageUrl?: string;
  sourceUrl?: string;
  category?: string;
  fitTags?: string[];
  intensity?: string;
  bestTime?: string;
  estimatedDuration?: string;
  location?: { lng: number; lat: number; address?: string };
}

// ========== 增强的内容卡片 ==========
export interface ContentCard {
  id: string;
  title: string;
  description: string;
  reason: string;           // 推荐理由
  category: ContentCategory;
  imageUrl?: string;

  // 位置信息（地图模式用）
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };

  // 时间信息
  bestTime?: string;        // 最佳时间（如"上午"）
  estimatedDuration?: string; // 预计耗时
  openHours?: string;       // 营业时间

  // 标签系统
  tags?: string[];          // 内容标签
  fitTags?: string[];       // 匹配的用户偏好
  suitableFor?: string[];   // 适合人群

  // 路线属性
  canConnectWith?: string[]; // 可串联的其他点ID
  distanceFromCenter?: string; // 距市中心距离

  // 状态
  status: "available" | "selected" | "scheduled";
}

// ========== 时间轴插槽 ==========
export interface ScheduleSlot {
  id: string;
  dayIndex: number;
  slot: TimeSlot;           // 上午/下午/晚上
  startTime?: string;       // 具体开始时间（如"09:00"）
  endTime?: string;         // 具体结束时间
  card?: ContentCard;       // 排入的内容卡片
  notes?: string;
}

// ========== 冲突检测 ==========
export interface ScheduleConflict {
  type: "time_overlap" | "distance" | "overpacked";
  severity: "warning" | "error";
  message: string;
  relatedSlots: string[];   // 相关的slot ID
  suggestion?: string;
}

// ========== 行程构建状态 ==========
export interface BuilderState {
  days: number;
  slots: ScheduleSlot[];
  conflicts: ScheduleConflict[];
  selectedCategories: ContentCategory[];
}

// ========== 行程断舍离（主动舍弃的愿望清单地点） ==========
export interface OmittedSpot {
  title: string;   // 被舍弃的地点名称（对应用户选中的卡片 title）
  reason: string;  // 具体客观理由（距离过远/容量超载/高风险依赖/严重同质）
}

export interface DayPlanItem {
  time: string;
  activity: string;
  note?: string;
  duration?: string;
  transport?: string;
  cost?: string;
  tips?: string;
  source?: string;
  recommendedDish?: string;
  period?: string;    // 模糊时段（前端展示用）：早上/上午/下午/晚上
  lng?: number;        // 经度（坐标注入）
  lat?: number;        // 纬度（坐标注入）
}

export interface TripGeneratePayload {
  destination: string;
  preferences: ExtractedTags;
  selectedCards: InsightCard[];
  harmony?: HarmonyResult;
}
