/**
 * POI → Emoji 匹配
 * 根据 POI 名称关键词匹配最合适的 emoji，替换占位符。
 * 按类别分组，关键词命中即返回。
 */

type Category = "attraction" | "food" | "souvenir" | "hotel";

interface EmojiRule {
  keywords: RegExp;
  emoji: string;
}

const ATTRACTION_RULES: EmojiRule[] = [
  { keywords: /寺|庙|佛|观音|禅|庵|院(?!子)/, emoji: "🛕" },
  { keywords: /山|峰|岭|岩|洞|峡谷/, emoji: "⛰️" },
  { keywords: /海|沙滩|沙(?!发|龙)|岛|湾|礁|潮/, emoji: "🌊" },
  { keywords: /湖|池|潭|泉/, emoji: "🏞️" },
  { keywords: /公园|植物园|湿地|森林/, emoji: "🌳" },
  { keywords: /古镇|古城|老街|村/, emoji: "🏘️" },
  { keywords: /博物馆|纪念馆|展览/, emoji: "🏛️" },
  { keywords: /塔|楼(?!市)/, emoji: "🗼" },
  { keywords: /桥/, emoji: "🌉" },
  { keywords: /夜景|灯光|摩天轮/, emoji: "🌃" },
  { keywords: /日出|日落|观景/, emoji: "🌅" },
  { keywords: /花|樱|梅|桃|荷/, emoji: "🌸" },
  { keywords: /雪|冰/, emoji: "❄️" },
  { keywords: /茶|茶园/, emoji: "🍵" },
  { keywords: /动物|熊猫|海洋馆|水族/, emoji: "🐼" },
  { keywords: /游乐|乐园|主题/, emoji: "🎡" },
  { keywords: /徒步|登山|步道/, emoji: "🥾" },
  { keywords: /影视|拍摄|基地/, emoji: "🎬" },
  { keywords: /瀑布/, emoji: "💦" },
  { keywords: /草原|牧场/, emoji: "🌾" },
  { keywords: /沙漠|戈壁/, emoji: "🏜️" },
  { keywords: /温泉|泡汤/, emoji: "♨️" },
  { keywords: /滑雪/, emoji: "⛷️" },
  { keywords: /漂流|划船|游船|渡/, emoji: "🚣" },
];

const FOOD_RULES: EmojiRule[] = [
  { keywords: /火锅|串串|麻辣烫/, emoji: "🍲" },
  { keywords: /海鲜|鱼|虾|蟹|贝/, emoji: "🦐" },
  { keywords: /咖啡|咖啡馆|cafe/i, emoji: "☕" },
  { keywords: /茶|茶馆|茶室|早茶/, emoji: "🍵" },
  { keywords: /面|粉|拉面|米线/, emoji: "🍜" },
  { keywords: /饺|包|馒头|点心|早茶/, emoji: "🥟" },
  { keywords: /烧烤|烤串|烤肉|撸串/, emoji: "🍢" },
  { keywords: /甜品|蛋糕|糖水|冰/, emoji: "🍰" },
  { keywords: /素|斋|蔬/, emoji: "🥗" },
  { keywords: /川菜|麻辣|湘菜|辣/, emoji: "🌶️" },
  { keywords: /粤菜|烧腊|煲/, emoji: "🍖" },
  { keywords: /日料|寿司|刺身/, emoji: "🍣" },
  { keywords: /西|牛排|意面|披萨/, emoji: "🍝" },
  { keywords: /小吃|快餐|路边|夜市/, emoji: "🍡" },
  { keywords: /粥/, emoji: "🥣" },
  { keywords: /鸡|鸭|鹅/, emoji: "🍗" },
  { keywords: /酒|酒吧|精酿/, emoji: "🍺" },
  { keywords: /早餐|早点/, emoji: "🥞" },
];

const SOUVENIR_RULES: EmojiRule[] = [
  { keywords: /茶|茶叶/, emoji: "🍵" },
  { keywords: /饼|糕|酥|糖/, emoji: "🍪" },
  { keywords: /酒/, emoji: "🍶" },
  { keywords: /丝绸|绸|绣/, emoji: "🎀" },
  { keywords: /瓷|陶/, emoji: "🏺" },
  { keywords: /手工|工艺|文创/, emoji: "🎨" },
  { keywords: /果|干|蜜饯/, emoji: "🍑" },
  { keywords: /香|香烛/, emoji: "🕯️" },
  { keywords: /海鲜|干|海味/, emoji: "🦑" },
];

const HOTEL_RULES: EmojiRule[] = [
  { keywords: /民宿|客栈|农家/, emoji: "🏡" },
  { keywords: /度假| resort/i, emoji: "🏖️" },
  { keywords: /青年|青旅/, emoji: "🎒" },
  { keywords: /公寓/, emoji: "🏢" },
  { keywords: /温泉/, emoji: "♨️" },
];

const CATEGORY_DEFAULT: Record<Category, string> = {
  attraction: "📍",
  food: "🍜",
  souvenir: "🎁",
  hotel: "🏨",
};

const RULES: Record<Category, EmojiRule[]> = {
  attraction: ATTRACTION_RULES,
  food: FOOD_RULES,
  souvenir: SOUVENIR_RULES,
  hotel: HOTEL_RULES,
};

/**
 * 根据 POI 名称和类别返回最合适的 emoji。
 */
export function emojiForPoi(name: string, category: Category): string {
  const rules = RULES[category] || [];
  for (const rule of rules) {
    if (rule.keywords.test(name)) return rule.emoji;
  }
  return CATEGORY_DEFAULT[category];
}

/** 类别对应的渐变色（用于卡片左侧背景） */
export const CATEGORY_GRADIENTS: Record<Category, string> = {
  attraction: "from-sky-400 to-blue-500",
  food: "from-orange-400 to-red-500",
  souvenir: "from-amber-400 to-yellow-500",
  hotel: "from-violet-400 to-purple-500",
};
