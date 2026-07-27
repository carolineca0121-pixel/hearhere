import type { ScheduleSlot, ContentCard, ScheduleConflict, TimeSlot } from "./types";

// 时段显示信息
export const SLOT_INFO: Record<TimeSlot, { label: string; defaultTime: string }> = {
  morning: { label: "上午", defaultTime: "09:00-12:00" },
  afternoon: { label: "下午", defaultTime: "14:00-17:00" },
  evening: { label: "晚上", defaultTime: "18:00-21:00" },
};

// 创建空的时间轴
export function createEmptySlots(days: number): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  for (let day = 0; day < days; day++) {
    slots.push({
      id: `day-${day}-morning`,
      dayIndex: day,
      slot: "morning",
    });
    slots.push({
      id: `day-${day}-afternoon`,
      dayIndex: day,
      slot: "afternoon",
    });
    slots.push({
      id: `day-${day}-evening`,
      dayIndex: day,
      slot: "evening",
    });
  }
  return slots;
}

// 将卡片放入指定插槽
export function placeCardInSlot(
  slots: ScheduleSlot[],
  slotId: string,
  card: ContentCard
): { slots: ScheduleSlot[]; conflicts: ScheduleConflict[] } {
  const newSlots = slots.map((slot) => {
    if (slot.id === slotId) {
      const slotInfo = SLOT_INFO[slot.slot];
      return {
        ...slot,
        card: { ...card, status: "scheduled" as const },
        startTime: slotInfo.defaultTime.split("-")[0],
        endTime: slotInfo.defaultTime.split("-")[1],
      };
    }
    return slot;
  });

  const conflicts = validateSchedule(newSlots);
  return { slots: newSlots, conflicts };
}

// 从插槽中移除卡片
export function removeCardFromSlot(
  slots: ScheduleSlot[],
  slotId: string
): { slots: ScheduleSlot[]; conflicts: ScheduleConflict[] } {
  const newSlots = slots.map((slot) => {
    if (slot.id === slotId) {
      const { card, startTime, endTime, ...rest } = slot;
      return rest;
    }
    return slot;
  });

  const conflicts = validateSchedule(newSlots);
  return { slots: newSlots, conflicts };
}

// 验证行程冲突
export function validateSchedule(slots: ScheduleSlot[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // 按天分组检查
  const slotsByDay: Record<number, ScheduleSlot[]> = {};
  slots.forEach((slot) => {
    if (!slotsByDay[slot.dayIndex]) {
      slotsByDay[slot.dayIndex] = [];
    }
    slotsByDay[slot.dayIndex].push(slot);
  });

  // 检查每天是否排得太满
  Object.entries(slotsByDay).forEach(([dayIndexStr, daySlots]) => {
    const dayIndex = parseInt(dayIndexStr);
    const filledSlots = daySlots.filter((slot) => slot.card);

    // 用户要求：去掉「排得比较满」这类功能性废话提示，不再警告。
    void filledSlots; // 保留变量避免未使用警告
  });

  // 检查距离冲突（简化版）
  const scheduledCards = slots.filter((s) => s.card).map((s) => s.card!);
  if (scheduledCards.length >= 2) {
    // 检查是否有距离市中心较远的点排在一起
    const farCards = scheduledCards.filter(
      (c) => c.distanceFromCenter && !c.distanceFromCenter.includes("市中心")
    );
    if (farCards.length >= 2) {
      const relatedSlotIds = slots
        .filter((s) => s.card && farCards.some((fc) => fc.id === s.card!.id))
        .map((s) => s.id);

      conflicts.push({
        type: "distance",
        severity: "warning",
        message: "有些景点距离较远，请注意交通时间",
        relatedSlots: relatedSlotIds,
        suggestion: "建议将距离较远的点安排在同一天，或者预留更多交通时间",
      });
    }
  }

  return conflicts;
}

// 自动排期（简单版）
export function autoSchedule(
  cards: ContentCard[],
  days: number
): { slots: ScheduleSlot[]; conflicts: ScheduleConflict[] } {
  const slots = createEmptySlots(days);
  let cardIndex = 0;

  // 简单策略：按顺序填入
  for (let day = 0; day < days && cardIndex < cards.length; day++) {
    const daySlots = ["morning", "afternoon", "evening"] as TimeSlot[];
    for (const slot of daySlots) {
      if (cardIndex >= cards.length) break;

      const slotId = `day-${day}-${slot}`;
      const slotIndex = slots.findIndex((s) => s.id === slotId);
      if (slotIndex !== -1) {
        const card = cards[cardIndex];
        const slotInfo = SLOT_INFO[slot];
        slots[slotIndex] = {
          ...slots[slotIndex],
          card: { ...card, status: "scheduled" as const },
          startTime: slotInfo.defaultTime.split("-")[0],
          endTime: slotInfo.defaultTime.split("-")[1],
        };
        cardIndex++;
      }
    }
  }

  const conflicts = validateSchedule(slots);
  return { slots, conflicts };
}

// 将排期结果转换为DayPlan格式（用于保存到数据库）
export function convertToDayPlans(slots: ScheduleSlot[]) {
  const dayPlans: Record<number, any[]> = {};

  slots.forEach((slot) => {
    if (!slot.card) return;

    if (!dayPlans[slot.dayIndex]) {
      dayPlans[slot.dayIndex] = [];
    }

    const timeStr = slot.startTime || SLOT_INFO[slot.slot].defaultTime.split("-")[0];
    dayPlans[slot.dayIndex].push({
      time: timeStr,
      activity: slot.card.title,
      note: slot.card.description,
      duration: slot.card.estimatedDuration,
      source: "user_selected",
    });
  });

  return dayPlans;
}
