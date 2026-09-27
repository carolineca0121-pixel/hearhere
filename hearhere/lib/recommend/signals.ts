// lib/recommend/signals.ts — P2 偏好 → 结构化推荐信号（纯函数，可单测）
// E6-1A：只服务排序链路；E6-1B 召回层将复用同一信号源。

export type Interest = "photo" | "food" | "culture" | "nature" | "religion" | "niche";
export type Party = "family" | "couple" | "friends";

export interface PreferenceSignals {
  interests: Interest[];
  pace: "slow" | null;
  mobility: "elderly" | null;
  party: Party | null;
  food: {
    localClassic: boolean; // 用户想要本地老字号/特色
    fastFoodOk: boolean; // 用户明确接受/想要快餐（此时不得降权快餐）
  };
  /** 审计用：命中各信号的原始文本片段 */
  evidence: string[];
}

const LEXICON: Array<{ signal: string; re: RegExp }> = [
  { signal: "interest:photo", re: /拍照|出片|打卡|摄影|网红机位/ },
  { signal: "interest:food", re: /美食|探店|小吃|吃遍|餐厅|吃货/ },
  { signal: "interest:culture", re: /人文|历史|文化|博物|古镇|古迹|街区/ },
  { signal: "interest:nature", re: /自然|风光|风景|山水|湖|湿地|森林|公园/ },
  { signal: "interest:religion", re: /祈福|寺庙|拜佛|寺院|烧香/ },
  { signal: "interest:niche", re: /小众|秘境|人少|冷门|避开人群/ },
  { signal: "pace:slow", re: /慢节奏|慢游|松弛|悠闲|慢慢|不赶/ },
  { signal: "mobility:elderly", re: /老人|长辈|父母|爸妈|不能多走|腿脚|膝盖|轮椅|年纪大/ },
  { signal: "party:family", re: /家庭|家人|父母|带娃|亲子|孩子|小孩/ },
  { signal: "party:couple", re: /情侣|约会|爱人|男友|女友|老公|老婆|度蜜月/ },
  { signal: "party:friends", re: /朋友|闺蜜|兄弟|同事|团建/ },
  { signal: "food:localClassic", re: /本地|特色|老字号|本帮|杭帮|地道|正宗/ },
  { signal: "food:fastFoodOk", re: /快餐|肯德基|麦当劳|汉堡|便利店|随便吃/ },
];

/**
 * 把 P2 的 preferences/constraints/rawText 解读成结构化推荐信号。
 * 纯函数：同输入恒同输出；不发起任何 IO。
 */
export function preferenceSignals(tagsText: string[], rawText?: string): PreferenceSignals {
  const corpus = [...tagsText, ...(rawText ? [rawText] : [])];
  const hit = new Set<string>();
  const evidence: string[] = [];

  for (const text of corpus) {
    for (const { signal, re } of LEXICON) {
      if (!hit.has(signal) && re.test(text)) {
        hit.add(signal);
        evidence.push(`${signal} ← "${text.match(re)?.[0]}"`);
      }
    }
  }

  const interests = (["photo", "food", "culture", "nature", "religion", "niche"] as Interest[]).filter(
    (i) => hit.has(`interest:${i}`)
  );

  return {
    interests,
    pace: hit.has("pace:slow") ? "slow" : null,
    mobility: hit.has("mobility:elderly") ? "elderly" : null,
    party: hit.has("party:family") ? "family" : hit.has("party:couple") ? "couple" : hit.has("party:friends") ? "friends" : null,
    food: {
      localClassic: hit.has("food:localClassic"),
      fastFoodOk: hit.has("food:fastFoodOk"),
    },
    evidence,
  };
}

/** 给 LLM prompt 用的紧凑信号描述（非原始 chips 堆砌） */
export function signalsSummary(s: PreferenceSignals): string {
  const parts: string[] = [];
  if (s.party === "family") parts.push("家庭出行");
  if (s.party === "couple") parts.push("情侣出行");
  if (s.party === "friends") parts.push("朋友结伴");
  if (s.mobility === "elderly") parts.push("有老人同行、步行负担要低");
  if (s.pace === "slow") parts.push("慢节奏");
  if (s.interests.length) parts.push(`兴趣:${s.interests.join("/")}`);
  if (s.food.localClassic) parts.push("想吃本地老字号/特色");
  return parts.join("，") || "无特殊偏好";
}
