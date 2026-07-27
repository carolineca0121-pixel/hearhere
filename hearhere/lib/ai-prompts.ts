import type { ExtractedTags, HarmonyResult, InsightCard } from "@/lib/types";
import type { NormalizedPOI } from "@/lib/amap";

/**
 * 合并 refine + extract 为一次调用，减少 LLM 往返。
 * 从口语化转写直接提取结构化标签。
 */
export function quickExtractPrompt(transcript: string): string {
  return `你是 HearHere 旅行助手。用户通过语音说了旅行需求，请直接从口语化转写中提取结构化信息。仅输出 JSON，不要其他文字。

字段（所有字段短小精悍，可空）：
- destination：目的地（如「普陀山」「厦门」）
- departure：出发地（如「上海」）
- tripType：出行关系（如「家庭游」「情侣游」「闺蜜游」「独自游」）
- peopleCount：人数（数字）
- days：天数（数字）
- transportation：交通方式（如「自驾」「高铁」「飞机」）
- budget：预算（如「2000元」「中等」「不设限」）
- preferences：偏好数组（如「陪父母」「看海」「拍照」）
- constraints：约束数组（如「老人不走多路」）
- conflicts：冲突数组
- groupMode：是否多人出行（布尔）

【示例】
输入：「我和爸妈从上海自驾去普陀山玩三天」
输出：
{
  "destination": "普陀山",
  "departure": "上海",
  "tripType": "家庭游",
  "peopleCount": 3,
  "days": 3,
  "transportation": "自驾",
  "preferences": ["陪父母"],
  "constraints": [],
  "conflicts": [],
  "groupMode": true
}

用户语音：
「${transcript}」`;
}

export function extractPrompt(transcript: string): string {
  return `你是 HearHere 旅行助手。请从以下用户语音转写中提取结构化信息，仅使用简体中文。
要求：只输出一个 JSON 对象，不要其他文字。

【重要】不要重复用户原话！所有字段都要短小精悍。

字段说明：
- destination：目的地（字符串，可空，只能是城市/景区/地区名，如「普陀山」「厦门」「西安」）
- departure：出发地（字符串，可空，如「上海」「北京」）
- tripType：出行关系（字符串，可空，如「家庭游」「情侣游」「闺蜜游」「独自游」「团建」）
- peopleCount：人数（数字，可空）
- days：天数（数字，可空，优先用阿拉伯数字）
- transportation：交通方式（字符串，可空，如「自驾」「高铁」「飞机」）
- budget：预算描述（字符串，可空，如「2000 元」「中等」「不设限」）
- preferences：偏好数组（短字符串，如「爱吃辣」「看海」「小众」「拍照」）
- constraints：硬性约束数组（短字符串，如「老人不走多路」「不吃香菜」）
- conflicts：已识别的冲突点数组
- groupMode：是否多人/团体出行（布尔）

【示例输入】
「我和爸妈计划从上海自驾去普陀山玩，预计三天。」

【示例输出】
{
  "destination": "普陀山",
  "departure": "上海",
  "tripType": "家庭游",
  "peopleCount": 3,
  "days": 3,
  "transportation": "自驾",
  "budget": null,
  "preferences": ["陪父母"],
  "constraints": [],
  "conflicts": [],
  "groupMode": true
}

【另一个示例】
「三个女生五一去成都，不想太累，想找小众咖啡馆和拍照点」
{
  "destination": "成都",
  "departure": null,
  "tripType": "闺蜜游",
  "peopleCount": 3,
  "days": null,
  "transportation": null,
  "budget": null,
  "preferences": ["小众咖啡馆", "拍照", "不累"],
  "constraints": [],
  "conflicts": [],
  "groupMode": true
}

用户转写：
「${transcript}」`;
}

export function harmonyPrompt(tags: ExtractedTags, transcript: string): string {
  return `你是 HearHere 冲突协调引擎。根据多人出行偏好，生成「最大公约数」方案草案。仅简体中文，只输出 JSON：
{
  "summary": "一段调和摘要",
  "resolutions": ["方案1", "方案2"],
  "scheduleHints": ["时间线建议1"]
}

偏好 JSON：${JSON.stringify(tags)}
原始转写：「${transcript}」`;
}

// ── 出发/返程时间默认值映射 ──

const DEPARTURE_HOUR: Record<string, number> = {
  "早上出发": 9,
  "中午出发": 13,
  "下午出发": 15,
};

const RETURN_HOUR: Record<string, number> = {
  "午饭后返程": 13,
  "一早返程": 9,
};

/** 估算交通时长 */
function estimateTravelTime(
  departure: string | undefined,
  destination: string,
  transportation: string | undefined
): { label: string; hours: number } {
  if (!departure || departure === destination) {
    return { label: "前往目的地", hours: 2 };
  }

  if (transportation === "自驾" || transportation?.includes("自驾")) {
    // 粗略估算：两城市距离 ÷ 80km/h 平均速度
    // 上海→普陀山约 300km = 4h，上海→杭州约 180km = 2.5h，北京→西安约 1100km = 太远不适合自驾
    const knownDistances: Record<string, number> = {
      "上海-普陀山": 300,
      "上海-杭州": 180,
      "上海-苏州": 100,
      "上海-南京": 300,
      "上海-黄山": 400,
      "上海-厦门": 1000,
      "北京-西安": 1100,
      "北京-天津": 130,
      "杭州-普陀山": 230,
      "杭州-黄山": 280,
      "南京-黄山": 350,
    };
    const key = `${departure}-${destination}`;
    const dist = knownDistances[key] || knownDistances[`${destination}-${departure}`];
    if (dist) {
      const hours = Math.round(dist / 80);
      return { label: `自驾约 ${hours} 小时`, hours };
    }
    return { label: "自驾前往", hours: 2 };
  }

  if (transportation === "高铁" || transportation?.includes("高铁")) {
    return { label: "高铁约 1-3 小时", hours: 2 };
  }

  if (transportation === "飞机" || transportation?.includes("飞机")) {
    return { label: "飞行+候机约 3-4 小时", hours: 3 };
  }

  // 默认
  return { label: "前往目的地", hours: 2 };
}

export function tripPrompt(
  destination: string,
  tags: ExtractedTags,
  cards: InsightCard[],
  harmony?: HarmonyResult,
  drivingRoute?: { distanceKm: number; durationHours: number; durationText: string; tolls?: number; serviceAreas: string[] } | null
): string {
  const hasCards = cards.length > 0;
  const cardTitles = cards.map((c) => c.title);

  // 推断天数
  let dayCount = tags.days ?? 2;
  const dates = tags.dates?.toLowerCase() ?? "";
  if (/三天|3天|三日|3日/.test(dates)) dayCount = 3;
  else if (/两天|2天|二天|两日|2日/.test(dates)) dayCount = 2;
  else if (/四天|4天|四日|4日/.test(dates)) dayCount = 4;
  else if (/五天|5天|五日|5日/.test(dates)) dayCount = 5;
  else if (/周末|两天一夜|2天1晚/.test(dates)) dayCount = 2;
  else if (/一周|七天|7天/.test(dates)) dayCount = 3;

  // 🆕 出发地和交通方式
  const departure = tags.departure || "";
  const transportation = tags.transportation || "";

  // 🆕 出发时间和返程时间
  const departureTimeLabel = tags.departureTime || "早上出发";
  const departureHour = DEPARTURE_HOUR[departureTimeLabel] || 9;
  const returnTimeLabel = tags.returnTime || "午饭后返程";
  const returnHour = RETURN_HOUR[returnTimeLabel] || 13;

  // 🆕 估算路途时间
  const travelEstimate = departure
    ? estimateTravelTime(departure, destination, transportation)
    : null;

  const cardHint = hasCards
    ? `【极其重要】用户已通过滑卡明确选择了以下 ${cards.length} 个地点，这些地点是「必去项」，必须全部安排进 days 时间线里，一个都不能漏！！！
已选卡片：${JSON.stringify(cardTitles)}
每个选中的地点对应的 item.source 必须标成 "selected_card"。
安排原则：寺庙/景区放上午，海边/日落放傍晚，街区/夜市放晚上，美食放午餐或晚餐时间。`
    : `用户没有手动选择任何卡片。请根据【偏好】和【目的地】自行为用户构想合理的活动安排（包括知名景点、餐饮、休憩、夜景等），不要留空。`;

  // 根据人群定制推荐风格
  let crowdStyle = "";
  if (/父母|爸妈|老人|长辈/.test(tags.preferences.join("") + (tags.dates || ""))) {
    crowdStyle = `用户是和父母/长辈一起出行：
- 行程节奏要慢，不要太赶，每半天不超过 2 个主要活动
- 多安排休息时间
- 餐饮要适合长辈口味（不要太辣太刺激）
- 交通要考虑便利性
- 避开人太多的时间段`;
  } else if (/女朋友|男朋友|情侣|约会|求婚|告白/.test(tags.preferences.join(""))) {
    crowdStyle = `用户是情侣出行，行程要浪漫，多安排适合两人的活动和景色。`;
  } else if (/闺蜜|女生|姐妹|朋友/.test(tags.preferences.join(""))) {
    crowdStyle = `用户是朋友/闺蜜结伴出行，行程要轻松有趣，适合拍照打卡。`;
  } else {
    crowdStyle = `根据目的地和时间安排合理的行程节奏。`;
  }

  // 根据目的地提供真实推荐示例
  let destinationExamples = "";
  if (/普陀山/.test(destination)) {
    destinationExamples = `【普陀山真实推荐参考】
- 必去寺庙：普济寺、法雨寺、慧济寺、南海观音
- 素斋推荐：普济寺素斋（推荐菜：素面、素鸭、观音饼）、法雨寺素斋
- 海鲜推荐：朱家尖海鲜排档（推荐菜：清蒸梭子蟹、椒盐皮皮虾、葱油花蛤）
- 海边/观景：百步沙、千步沙、紫竹林
- 街区：西天景区
- 伴手礼：普陀山佛茶、观音饼、素饼`;
  } else if (/厦门/.test(destination)) {
    destinationExamples = `【厦门真实推荐参考】
- 景点推荐：鼓浪屿、曾厝垵、南普陀寺、厦门大学、中山路
- 美食推荐：八市海鲜加工、沙茶面、土笋冻、海蛎煎
- 伴手礼：黄胜记肉脯、赵小姐的店`;
  } else if (/西安/.test(destination)) {
    destinationExamples = `【西安真实推荐参考】
- 景点推荐：兵马俑、华清宫、大雁塔、回民街、城墙
- 美食推荐：肉夹馍、凉皮、羊肉泡馍、biangbiang面`;
  }

  // 🆕 构建路途指令
  let travelInstruction = "";

  if (departure && transportation) {
    const travelLabel = travelEstimate?.label || "前往目的地";
    const travelHours = travelEstimate?.hours || 2;

    if (transportation === "自驾" || transportation?.includes("自驾")) {
      // 有真实路径数据就用真实数据，否则用估算
      const realDuration = drivingRoute?.durationText || travelLabel;
      const realHours = drivingRoute?.durationHours || travelHours;
      const distanceHint = drivingRoute ? `全程约 ${drivingRoute.distanceKm} 公里` : "";
      const tollsHint = drivingRoute?.tolls ? `过路费约 ${drivingRoute.tolls} 元` : "油费+过路费约 150-300 元";
      const serviceAreaHint = drivingRoute && drivingRoute.serviceAreas.length > 0
        ? `沿途可休整的服务区：${drivingRoute.serviceAreas.slice(0, 3).join("、")}。建议每开 2 小时休息一次，可在 note 里提醒用户。`
        : "路上服务区可以休整";

      travelInstruction = `
【🚗 路途安排（极其重要）】
用户从「${departure}」${transportation}前往「${destination}」（${realDuration}${distanceHint ? "，" + distanceHint : ""}）。

Day 1 上午第一个活动必须是「${departure}${transportation}前往${destination}」：
- time: "${String(departureHour).padStart(2, "0")}:00"
- source: "transport"
- transport: "${realDuration}"
- duration: "约 ${realHours} 小时"
- cost: "${tollsHint}"
- note: "建议早起出发。${serviceAreaHint}"

最后一天（Day ${dayCount}）下午必须包含返程：
- time: "${String(returnHour).padStart(2, "0")}:00"
- activity: "${destination}${transportation}返回${departure}"
- source: "transport"
- transport: "${realDuration}"
- duration: "约 ${realHours} 小时"
- cost: "${tollsHint}"
- note: "${returnTimeLabel === "午饭后返程" ? "午饭后返程，避开晚高峰" : "早起返程，到家还能休息一下"}"

路途时间算入行程天数，所以 Day 1 的路途后只能安排下午和晚上的活动，最后一天返程前只能安排上午的活动。`;
    } else {
      // 高铁/飞机等公共交通
      travelInstruction = `
【🚄/✈️ 路途安排（极其重要）】
用户从「${departure}」乘坐${transportation}前往「${destination}」（${travelLabel}）。

Day 1 上午第一个活动必须是「${departure}${transportation}前往${destination}」：
- time: "${String(departureHour).padStart(2, "0")}:00"
- source: "transport"
- transport: "${travelLabel}"
- duration: "${travelLabel}"
- note: "${transportation === "飞机" ? "建议提前 2 小时到机场，落地后打车/地铁去酒店放行李" : "高铁站一般离市区不远，出站后打车去酒店放行李"}"

最后一天（Day ${dayCount}）下午必须包含返程：
- time: "${String(returnHour).padStart(2, "0")}:00"
- activity: "${destination}${transportation}返回${departure}"
- source: "transport"
- transport: "${travelLabel}"
- duration: "${travelLabel}"
- note: "${returnTimeLabel === "午饭后返程" ? "午饭后前往车站/机场，时间充裕" : "早班车/早班机，建议提前出发"}"

路途时间算入行程天数，Day 1 路途后只能安排下午和晚上的活动，最后一天返程前只能安排上午的活动。`;
    }
  } else if (!departure) {
    // 没有出发地信息 — 假定用户在目的地已经
    travelInstruction = `
【📍 路途安排说明】
用户未提供出发地，假设用户已在「${destination}」或附近。Day 1 直接开始游玩，最后一天无需路途模块。如有酒店入住需要在 Day 1 下午安排。`;
  }

  return `你是 HearHere 资深行程规划师，擅长写出像小红书/马蜂窝一样实用、有温度、信息密度高的旅行攻略。

根据以下信息生成一份 ${dayCount} 天的详细行程攻略。仅输出 JSON，不要其他文字。

【极其重要】必须生成完整的 ${dayCount} 天，一天都不能少！！！Day 1、Day 2、Day 3 都必须有内容。

JSON 格式：
{
  "title": "简洁攻略标题，如「轻松家庭普陀山三日慢旅行」「陪爸妈的普陀山祈福休闲之旅」",
  "vibeTheme": "sea|forest|dusk",
  "overview": "一段 2-3 句的整体行程概述，像朋友口述一样有温度，不要超过 100 字",
  "travelTips": ["贴士1", "贴士2", "贴士3", "贴士4"],
  "days": [
    {
      "dayIndex": 1,
      "items": [
        {
          "time": "09:00",
          "activity": "具体地点名称，如「上海自驾前往普陀山」「普济寺参拜」「朱家尖海鲜排档午餐」",
          "note": "一句话体验亮点，说明为什么安排这个时间，如「上午游客较少，适合陪父母慢慢游览」",
          "duration": "预计停留时长，如「约 1.5 小时」",
          "transport": "从上一点过来的交通方式/时长，如「步行 10 分钟」「自驾约 4 小时」",
          "cost": "人均消费参考，如「门票 35 元/人」「约 80 元/人」",
          "tips": "实用提醒，如「建议提前预约」「避开正午人流」",
          "source": "selected_card|recommended|food|transport|rest",
          "recommendedDish": "招牌菜/必点菜（仅餐饮项需要，如「素面、素鸭」）"
        }
      ]
    }
  ]
}

目的地：${destination}
天数要求：必须生成完整的 ${dayCount} 天，一天都不能少！！！
出发信息：出发地=${departure || "未知"}，交通=${transportation || "未指定"}，出发时间=${departureTimeLabel}（${String(departureHour).padStart(2, "0")}:00），返程偏好=${returnTimeLabel}（${String(returnHour).padStart(2, "0")}:00）
偏好：${JSON.stringify(tags)}
${cardHint}
${travelInstruction}
${crowdStyle}
${destinationExamples}
调和方案：${harmony ? JSON.stringify(harmony) : "无"}

【输出要求（必须严格遵守）】
1. title 要提炼，绝对不要直接复述用户原话！！！
  正确例子：「轻松家庭普陀山三日慢旅行」「陪爸妈的普陀山祈福休闲之旅」
  错误例子：「探索我和爸妈计划后天从上海自驾去普陀山玩三天」

2. 【极其重要】必须生成完整的 ${dayCount} 天！！！
  如果是 3 天，必须有 Day1、Day2、Day3，一天都不能少！
  ${departure ? `第 1 天（Day 1）的第一个 item 必须是「${departure}${transportation}前往${destination}」（路途），第 ${dayCount} 天（Day ${dayCount}）的最后必须有「返程」item！！！` : ""}

3. 【极其重要】如果用户选择了卡片，这些地点必须全部出现在 days 里，source="selected_card"，漏掉任何一个都是严重错误！

4. 每个活动都要是真实存在的地点！！！
  错误：「探索目的地」「逛特色街区」「感受当地烟火气」
  正确：「普济寺参拜」「百步沙看日落」「朱家尖海鲜排档午餐」

5. 每天至少包含两个餐饮时间（午餐+晚餐），source="food"
  餐饮项必须有推荐菜（recommendedDish）！！！
  如果不确定真实店名，写类型+区域，如「普陀山素斋」「朱家尖海鲜排档」

6. note要说明为什么安排这个时间，以及适合谁
  好例子：「上午游客较少，适合带父母慢慢游览」
  好例子：「傍晚光线柔和，适合拍照」

7. 【🕐 时间精确度要求】
  后台 time 字段必须精确到小时维度（如 "09:00"、"14:00"、"18:00"），这样才能精准估算用户在各时间段的行为。
  前端展示时会自动映射为模糊时段（早上/上午/中午/下午/晚上），但对你的输出来说，必须用精确的 HH:00 格式。

8. travelTips 要实用，4-5条`;
}

/**
 * 生成景点卡片（不含美食！）
 */
export function llmCardsPrompt(
  destination: string,
  tags: ExtractedTags,
  count = 12
): string {
  let realExamples = "";
  if (/普陀山/.test(destination)) {
    realExamples = `【普陀山真实景点参考】
普济寺、法雨寺、慧济寺、南海观音、百步沙、千步沙、紫竹林、西天景区`;
  } else if (/厦门/.test(destination)) {
    realExamples = `【厦门真实景点参考】
鼓浪屿、南普陀寺、厦门大学、曾厝垵、中山路、沙坡尾、白城沙滩、植物园`;
  } else if (/西安/.test(destination)) {
    realExamples = `【西安真实景点参考】
兵马俑、华清宫、大雁塔、西安城墙、回民街、陕西历史博物馆、大唐不夜城、碑林博物馆`;
  }

  return `你是 HearHere 的旅行决策卡片生成器。用户想去【${destination}】，需求如下：
偏好：${JSON.stringify(tags.preferences)}
硬性约束：${JSON.stringify(tags.constraints)}
冲突点：${JSON.stringify(tags.conflicts)}
人数：${tags.peopleCount ?? "未说明"}
预算：${tags.budget ?? "未说明"}
时间：${tags.dates ?? "未说明"}

请生成 ${count} 张【景点决策卡】，用于让用户决定「要不要把这个地点加入攻略」。

【重要规则】
- 只推荐真实具体的景点！不要推荐整个目的地！
  错误示例：「普陀山」「西安」
  正确示例：「普济寺」「兵马俑」
- 不要推荐美食/餐厅！美食会在下一步单独推荐！
- 不要推荐冷门怪名，只推荐知名核心景点！
- 不要推荐高铁站、火车站、机场、酒店等基础设施！
- 每张卡片的 review 和 reason 必须独特，不要重复套话！
  错误套话：「适合全家放松」「感受当地氛围」「宗教文化体验」
- reason 必须结合用户同行人、时间、交通或景点特殊性；如果是郊区/远距离景点，必须写明「需预留交通时间」或大概距离/车程。

【示例 - 普陀山】
「法雨寺」
review:「古树成荫，夏日常有微风，很舒服」
reason:「树荫多，夏天体感舒适，适合陪父母」

「百步沙」
review:「傍晚时分，海面泛着橘光，拍照很美」
reason:「日落很美，适合拍照，光线柔和」

【示例 - 西安】
「西安城墙」
review:「可以租辆自行车慢慢骑，俯瞰老城烟火」
reason:「节奏慢，不用赶，适合随意逛」

「兵马俑」
review:「站在俑坑前，还是会被千年前的气势震撼」
reason:「必打卡地标，来西安不看可惜」

仅输出 JSON 数组，不要其他文字，格式：
[
  {
    "title": "真实景点名称",
    "review": "一句有画面感的真实感点评，≤40字",
    "reason": "为什么适合这个用户，必须呼应偏好，≤30字",
    "fitTags": ["看海", "陪父母", "不赶路"],
    "intensity": "轻松|适中|偏累",
    "bestTime": "上午|下午|傍晚|晚上",
    "estimatedDuration": "1-2小时",
    "category": "attraction"
  }
]

${realExamples}`;
}

/**
 * 生成美食推荐卡片（推荐特色菜，不是具体餐厅！）
 */
export function foodCardsPrompt(
  destination: string,
  tags: ExtractedTags,
  count = 12
): string {
  let realExamples = "";
  if (/普陀山/.test(destination)) {
    realExamples = `【普陀山美食参考】
素斋、素面、观音饼、海鲜排档、椒盐皮皮虾、清蒸梭子蟹、葱油花蛤`;
  } else if (/厦门/.test(destination)) {
    realExamples = `【厦门美食参考】
沙茶面、土笋冻、海蛎煎、花生汤、沙坡尾海鲜、八市海鲜加工、烧肉粽`;
  } else if (/西安/.test(destination)) {
    realExamples = `【西安美食参考】
肉夹馍、凉皮、羊肉泡馍、biangbiang面、甑糕、镜糕、油茶麻花、酸梅汤`;
  }

  return `你是 HearHere 的美食推荐生成器。用户去【${destination}】旅行，需求如下：
偏好：${JSON.stringify(tags.preferences)}
硬性约束：${JSON.stringify(tags.constraints)}

请生成 ${count} 种【推荐美食/小吃/特色菜】，给用户灵感。

【重要规则】
- 推荐特色菜/小吃种类，不是具体餐厅！
  正确示例：「素斋」「沙茶面」「肉夹馍」「地锅鸡」
  错误示例：「王记小吃」「xxx饭店」「徐州香包」「纪念品」「伴手礼」
- 如果目的地是徐州，推荐地锅鸡、羊方藏鱼、烙馍、把子肉、啥汤等美食；禁止推荐徐州香包。
- 每张卡片理由必须独特，不要重复套话！
- 如果有不能吃的（如宗教/过敏），要避开！

仅输出 JSON 数组，格式：
[
  {
    "title": "美食名称",
    "review": "一句话推荐理由，有画面感，≤30字",
    "reason": "为什么适合这个用户，≤25字",
    "fitTags": ["本地特色"],
    "intensity": "轻松",
    "bestTime": "午餐|晚餐|早餐|下午茶|随时",
    "estimatedDuration": "0.5-1小时",
    "category": "food"
  }
]

${realExamples}`;
}

/**
 * 基于真实 Amap POI 数据，用 LLM 写个性化 review 和 reason。
 * 不生成新卡片标题——标题已经是真地点。LLM 只负责写推荐语。
 */
export function poiReviewPrompt(
  destination: string,
  tags: ExtractedTags,
  pois: NormalizedPOI[],
  category: "attraction" | "food"
): string {
  const poiList = pois
    .map(
      (p) =>
        `- ${p.name}（${p.type.split(";")[0] || "未知类型"}，📍 ${p.address}，${p.district}）`
    )
    .join("\n");

  const isFood = category === "food";

  let styleNotes = "";
  if (/父母|爸妈|老人|长辈/.test(tags.preferences.join(""))) {
    styleNotes = `- 用户是和父母/长辈出行，review 偏向舒适、便利、适合长辈\n- 避开过于刺激或体力消耗大的说法`;
  } else if (/闺蜜|女生|姐妹|朋友/.test(tags.preferences.join(""))) {
    styleNotes = `- 用户是朋友结伴出行，review 偏向好拍、有趣、氛围感`;
  } else if (/情侣|约会|求婚/.test(tags.preferences.join(""))) {
    styleNotes = `- 用户是情侣出行，review 偏向浪漫、适合两人`;
  }

  return `你是 HearHere 的内容编辑。以下是从高德地图搜索到的真实${isFood ? "餐饮" : "景点"}数据，请为每一个写:
1. review: 一句真实、有画面感的短评（≤40字）——像小红书/大众点评的质感，不要套话
2. reason: 一句话说明为什么适合当前这个用户（≤30字），必须结合用户偏好
3. fitTags: 2-4 个匹配的用户偏好标签（从用户偏好中挑，优先匹配）

${styleNotes}

目的地：${destination}
用户偏好：${tags.preferences.join("、")}
用户约束：${tags.constraints.join("、") || "无特别约束"}
${!isFood ? "注意：这些都是真实景点，请根据景点类型写匹配的点评" : ""}
${isFood ? "注意：这些都是真实餐厅/美食，请写让用户有食欲的点评，如果有推荐菜可以提" : ""}

真实 POI 列表：
${poiList}

只输出 JSON 数组，不要其他文字：
[
  {
    "name": "POI名称（必须和上面完全一致）",
    "review": "一句真实有画面感的短评，≤40字",
    "reason": "为什么适合当前用户，≤30字",
    "fitTags": ["标签1", "标签2"]
  }
]`;
}

/**
 * 截图创建行程 — 视觉模型专用 prompt。
 * 用户上传旅行攻略/聊天截图，AI 识别图片内容并提取结构化旅行需求。
 * 输出格式与 quickExtractPrompt 保持一致，方便前端复用同一套 confirm 流程。
 */
export function visionExtractPrompt(): string {
  return `你是 HearHere 旅行助手。用户上传了一张旅行相关的截图（可能是小红书攻略、微信聊天记录、旅行笔记等），请仔细阅读图片中的文字内容，提取结构化的旅行需求信息。仅输出 JSON，不要其他文字。

字段（所有字段短小精悍，可空）：
- destination：目的地（如「普陀山」「厦门」）
- departure：出发地（如「上海」）
- tripType：出行关系（如「家庭游」「情侣游」「闺蜜游」「独自游」）
- peopleCount：人数（数字）
- days：天数（数字）
- transportation：交通方式（如「自驾」「高铁」「飞机」）
- budget：预算（如「2000元」「中等」「不设限」）
- preferences：偏好数组（如「陪父母」「看海」「拍照」）
- constraints：约束数组（如「老人不走多路」）
- conflicts：冲突数组
- groupMode：是否多人出行（布尔）

提取规则：
1. 如果截图是小红书/攻略类，目的地通常在标题或正文开头，天数看「X天X夜」「X日游」，偏好看攻略里反复强调的主题（美食/拍照/祈福等）
2. 如果截图是聊天记录，注意「我们」「我和XX」等表述推断人数和出行关系
3. 截图里明确提到的景点/餐厅不算 preferences，只提取旅行风格偏好
4. 看不出来的一律留空（null 或空数组），不要瞎编

只输出一个 JSON 对象。`;
}
