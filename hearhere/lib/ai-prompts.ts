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
  rawUserText?: string,
  harmony?: HarmonyResult,
  drivingRoute?: { distanceKm: number; durationHours: number; durationText: string; tolls?: number; serviceAreas: string[] } | null,
  isCustomCanvas?: boolean
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

  // ── 🎨 自定义画布模式：只生成物理骨架（交通+酒店+占位），绝不编造景点 ──
  if (isCustomCanvas) {
    const travelLabel = travelEstimate?.label || "前往目的地";
    const travelHours = travelEstimate?.hours || 2;
    const realDuration = drivingRoute?.durationText || travelLabel;
    const realHours = drivingRoute?.durationHours || travelHours;
    const goItem = departure
      ? `Day 1 第一个 item 必须是路途「${departure}${transportation || "前往"}${destination}」：time "${String(departureHour).padStart(2, "0")}:00"，source="transport"，transport="${realDuration}"，duration="约 ${realHours} 小时"`
      : `Day 1 无需路途项，直接从酒店/第一个占位开始`;
    const returnItem = departure
      ? `最后一天（Day ${dayCount}）最后一个 item 必须是返程「${destination}${transportation || ""}返回${departure}」：time "${String(returnHour).padStart(2, "0")}:00"，source="transport"，transport="${realDuration}"，duration="约 ${realHours} 小时"`
      : `最后一天无需返程项`;

    return `你是 HearHere 行程规划师。用户明确选择了「自定义画布」模式：他们不要你推荐任何景点或餐厅，只需要一个物理骨架（大交通+酒店入住+留白占位），其余内容由用户亲手填充。

根据以下信息生成一份 ${dayCount} 天的【空白画布行程】。仅输出 JSON，不要其他文字。

JSON 格式：
{
  "planningThought": "用大白话说明：这是用户选择的自定义画布，你已为他们锁定了往返交通和酒店入住，留白时段交给用户自己决定。如果原始语音里提到了具体酒店/车次，在这里点明你已经接收到了这些信息。",
  "title": "标题，如「${destination}${dayCount}日自定义画布：骨架搭好，等你涂鸦」",
  "vibeTheme": "sea|forest|dusk",
  "overview": "一两句温暖的说明：交通和住宿已帮你安排好，剩下的空白由你亲手填充",
  "travelTips": ["贴士1", "贴士2", "贴士3"],
  "omittedSpots": [],
  "days": [
    {
      "dayIndex": 1,
      "items": [
        {
          "time": "09:00",
          "activity": "地点或 [ ➕ 添加活动 ]",
          "note": "一句话说明",
          "duration": "预计停留时长",
          "transport": "交通方式与时长",
          "cost": "人均消费参考",
          "tips": "实用提醒",
          "source": "transport|rest|placeholder",
          "recommendedDish": ""
        }
      ]
    }
  ]
}

【骨架规则（严格遵守）】
1. ${goItem}
2. Day 1 中午（到达后）安排酒店办理入住：source="rest"，activity="酒店办理入住"，note 提醒放行李、稍作休整。如果用户原始语音里提到了具体酒店名，activity 直接用该酒店名。
3. 每天其余时段一律输出占位项：source="placeholder"，activity 固定为 "[ ➕ 添加活动 ]"，
   time 按合理节奏分布（上午 09:00、中午 12:00、下午 14:00、傍晚 16:00、晚上 19:00 中选取），
   note 写一句温暖的引导语（每天换说法），如「这个时段交给你，塞一家咖啡馆或想去的景点都行」。
   每天 2-3 个 placeholder，不超过 3 个。
4. ${returnItem}
5. 最后一天上午保留 1 个 placeholder，note 提示「退房前还可以在附近走走」。
6. 【绝对禁止】编造任何具体景点、餐厅、店名！除了路途和酒店入住，不允许出现任何真实地名或店名。
7. planningThought 必须体现：你识别到了原始语音中的哪些确定信息（交通时间/酒店/人数），以及你为什么这样排布骨架。

目的地：${destination}
用户原始语音（最高信息源）：「${rawUserText?.trim() || "未提供，以结构化偏好为准"}」
结构化偏好：${JSON.stringify(tags)}
出发信息：出发地=${departure || "未知"}，交通=${transportation || "未指定"}，出发时间=${departureTimeLabel}（${String(departureHour).padStart(2, "0")}:00），返程偏好=${returnTimeLabel}（${String(returnHour).padStart(2, "0")}:00）`;
  }

  const cardHint = hasCards
    ? `【愿望清单断舍离机制（极其重要）】用户已通过滑卡选择了以下 ${cards.length} 个地点，这是用户的「愿望清单」：
愿望清单：${JSON.stringify(cardTitles)}

处理规则——每个地点只有两种命运：「排入行程」或「说明理由后舍弃」，绝不允许悄悄消失：
1. 默认全部排入 days 时间线，对应 item.source 必须标成 "selected_card"。
2. 但你是专业规划师，不是清单复读机。如果某个地点满足以下任一「客观舍弃标准」，允许主动断舍离：
   - 距离过远：与当天主区域单程超过 1.5 小时，往返会毁掉整天节奏
   - 容量超载：全部排入会导致某天超过 4 个主要活动，行程变成赶场
   - 高风险依赖：强依赖天气/季节（如雨天看日落）、或需要预约但时间冲突
   - 严重同质：与已排入的地点体验高度重复（如两个雷同的古镇街区）
3. 每一个被舍弃的地点，必须写进 omittedSpots 数组，给出具体、客观、对用户说得出口的理由（禁止「时间不够」这种敷衍话，要写清「为什么是它被舍弃而不是别的」）。
4. 舍弃要克制：${cards.length} 个地点最多舍弃 ${Math.max(1, Math.floor(cards.length / 4))} 个，能排的尽量排。

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
  "planningThought": "【先写思考，再写行程】用一两百字大白话，写下你针对用户原始语音中特殊细节（如大交通班次时间、酒店位置、带老人小孩、特殊娱乐需求等）是如何统筹考虑、空间排布和物理妥协的思考过程。这一步能释放你的深度规划能力，必须认真写，禁止套话。",
  "title": "简洁攻略标题，有提炼感和结论，如「普陀山三日慢游：陪父母休闲祈福避坑路线」「轻松家庭普陀山三日慢旅行」",
  "vibeTheme": "sea|forest|dusk",
  "overview": "一段 2-3 句的整体行程概述，像朋友口述一样有温度，不要超过 100 字",
  "travelTips": ["贴士1", "贴士2", "贴士3", "贴士4"],
  "omittedSpots": [{ "title": "被舍弃的愿望清单地点名称", "reason": "未能排入的温和专业理由，20 字以内，如「与主区域不顺路，建议下次专程去」" }],
  "days": [
    {
      "dayIndex": 1,
      "items": [
        {
          "time": "09:00",
          "activity": "具体真实的地点/店铺名称，拒绝空泛，如「上海自驾前往普陀山」「普济寺参拜」「朱家尖阿勇海鲜排档」（而非「海鲜大排档」）",
          "note": "说明为什么安排在这个时间，以及适合谁，如「上午游客较少，适合陪父母慢慢游览」",
          "duration": "预计停留时长，如「约 1.5 小时」",
          "transport": "从上一个地点过来的交通方式与时长，如「步行 10 分钟」「自驾约 4 小时」",
          "cost": "人均消费参考，如「门票 35 元/人」「约 80 元/人」",
          "tips": "极其真实的就餐/游玩避坑指南，如「建议提前预约」「避开正午人流」",
          "source": "selected_card|recommended|food|transport|rest",
          "recommendedDish": "招牌菜（仅餐饮 food 项需要，至少 2 道具体菜名；非餐饮填空字符串）"
        }
      ]
    }
  ]
}

目的地：${destination}
【极其重要：用户原始语音（最高规划准则）】
用户最初口述的完整原话如下，这是细节最真实、最丰富的诉求（可能包含具体酒店位置、大交通班次/到站时间、特殊娱乐需求等结构化标签丢失的信息）：
「${rawUserText?.trim() || "（未提供原始语音，以下方结构化偏好为准）"}」
当结构化偏好与原始语音冲突时，以原始语音为准。planningThought 中必须体现你抓住了原始语音里的哪些特殊细节。

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

3. 【愿望清单：排入或说明】用户选择的每个卡片地点，要么出现在 days 里（source="selected_card"），要么出现在 omittedSpots 里并附具体客观理由，二者必居其一，不允许凭空消失！

4. 【🗺️ 绝对空间聚焦原则】一天一个主区域！！！
  先把当天要去的地点在脑子里按地理位置分组，每天只在一个主区域内活动。
  严禁跨区域折返：同一天内不允许出现「上午城东、下午城西、晚上又回城东」的钟摆式动线。
  同一天任意两个相邻活动之间的交通时间原则上不超过 40 分钟，超过就必须在 transport 字段里写清楚并给出理由。
  正确示范：Day 1 下午+晚上都围绕「朱家尖/本岛南端」，Day 2 全天「普陀山岛上」。

5. 【🚶 物理节奏与体力限制】
  - Day 1 是移动日：路途到达后只安排 1-2 个轻量活动暖场（如附近街区散步、一顿好饭），严禁到达当天下午排大型景区！
  - 最后一天是返程日：返程前只安排上午的活动，且地点必须靠近酒店或交通枢纽，拖着行李也能轻松完成。
  - 每天下午 14:00-16:00 之间，如果前后都是高强度活动，必须穿插一个 source="rest" 的休憩节点（回酒店午休/咖啡馆歇脚/茶馆发呆），尤其是有长辈同行的行程。
  - 每天主要活动（不含吃饭和休息）不超过 4 个，行程要「顺」不要「满」。

6. 每个活动都要是真实存在的地点！！！
  错误：「探索目的地」「逛特色街区」「感受当地烟火气」
  正确：「普济寺参拜」「百步沙看日落」「朱家尖海鲜排档午餐」

7. 【🍜 餐饮真实度（极其重要）】每天至少包含午餐+晚餐两个餐饮项，source="food"，并且：
  - 必须给出具体真实店名（知名老店/口碑排档/本地人常去的店），禁止「品尝当地美食」「特色餐厅」这种空泛表述！
  - 必须有推荐菜（recommendedDish），写 2-3 道具体招牌菜，如「素面、素鸭、观音饼」
  - tips 字段必须包含真实用餐情报：排队情况（如「饭点排队 30 分钟起，建议 11 点前到」）、避坑提示（如「海鲜问清时价再点」「只收现金」）、或预约建议
  - 餐厅要顺路：优先选当天主区域内的餐厅，不要为了一顿饭跨越整个城市
  - 实在不确定店名时，退而求其次写「类型+区域」（如「朱家尖海鲜排档」），但推荐菜和 tips 仍然必须有！

8. note要说明为什么安排这个时间，以及适合谁
  好例子：「上午游客较少，适合带父母慢慢游览」
  好例子：「傍晚光线柔和，适合拍照」

9. 【🕐 时间精确度要求】
  后台 time 字段必须精确到小时维度（如 "09:00"、"14:00"、"18:00"），这样才能精准估算用户在各时间段的行为。
  前端展示时会自动映射为模糊时段（早上/上午/中午/下午/晚上），但对你的输出来说，必须用精确的 HH:00 格式。

10. travelTips 要实用，4-5条；
   如果没有舍弃任何地点，omittedSpots 输出空数组 []，不要省略这个字段。`;
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
- mentionedPlaces：截图中明确提到的具体地点/景点/餐厅/店铺名称数组（如「西湖」「灵隐寺」「外婆家」）。这是 OCR 最重要的产出！只收具体地名，不要「当地美食」「网红打卡地」这种泛指。

提取规则：
1. 如果截图是小红书/攻略类，目的地通常在标题或正文开头，天数看「X天X夜」「X日游」，偏好看攻略里反复强调的主题（美食/拍照/祈福等）
2. 如果截图是聊天记录，注意「我们」「我和XX」等表述推断人数和出行关系
3. 截图里明确提到的景点/餐厅不算 preferences，只提取旅行风格偏好
4. 截图里明确提到的景点/餐厅/店铺，全部收进 mentionedPlaces（保留原名，不要改写、不要扩充）
5. 看不出来的一律留空（null 或空数组），不要瞎编

只输出一个 JSON 对象。`;
}
