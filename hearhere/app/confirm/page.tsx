"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/layout/glass-card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session";
import { getMicErrorMessage } from "@/lib/mic";
import {
  Mic,
  X,
  Users,
  MapPin,
  Clock,
  Car,
  Heart,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import type { ExtractedTags } from "@/lib/types";

// ── 缺失字段快速补全选项 ────────────────────────────

interface MissingField {
  key: keyof ExtractedTags;
  label: string;
  icon: React.ReactNode;
  hint: string;
  chips: string[];
}

function getMissingFields(tags: ExtractedTags): MissingField[] {
  const fields: MissingField[] = [];

  if (!tags.days) {
    fields.push({
      key: "days",
      label: "几天？",
      icon: <Clock className="h-3.5 w-3.5" />,
      hint: "还没说玩几天",
      chips: ["1天", "2天", "3天", "5天"],
    });
  }

  if (!tags.peopleCount) {
    fields.push({
      key: "peopleCount",
      label: "几个人？",
      icon: <Users className="h-3.5 w-3.5" />,
      hint: "还没说几个人去",
      chips: ["1人", "2人", "3人", "4人"],
    });
  }

  if (!tags.transportation) {
    fields.push({
      key: "transportation",
      label: "怎么去？",
      icon: <Car className="h-3.5 w-3.5" />,
      hint: "还没说交通方式",
      chips: ["自驾", "高铁", "飞机", "无所谓"],
    });
  }

  if (!tags.tripType) {
    fields.push({
      key: "tripType",
      label: "和谁去？",
      icon: <Users className="h-3.5 w-3.5" />,
      hint: "还没说出游关系",
      chips: ["家庭游", "情侣游", "闺蜜游", "独自游"],
    });
  }

  if (!tags.budget) {
    fields.push({
      key: "budget",
      label: "预算？",
      icon: <span className="text-xs">💰</span>,
      hint: "还没说预算范围",
      chips: ["经济", "中等", "不设限"],
    });
  }

  // 出发地
  if (!tags.departure) {
    fields.push({
      key: "departure",
      label: "从哪出发？",
      icon: <MapPin className="h-3.5 w-3.5" />,
      hint: "还没说出发地",
      chips: [],
    });
  }

  // 旅行偏好（主观，始终显示以便补充）
  fields.push({
    key: "preferences" as keyof ExtractedTags,
    label: "旅行偏好？",
    icon: <Heart className="h-3.5 w-3.5" />,
    hint: tags.preferences.length === 0 ? "还没说喜欢什么" : "补充更多偏好",
    chips: ["陪父母", "慢节奏", "拍照出片", "美食探店", "人文历史", "自然风光", "看海", "祈福", "小众"],
  });

  return fields;
}

// ── 结构化标签组件 ──────────────────────────────────

function StructuredTags({ tags }: { tags: ExtractedTags }) {
  const items: {
    icon: React.ReactNode;
    label: string;
    type: "meta" | "preference" | "constraint";
  }[] = [];

  if (tags.tripType) {
    items.push({ icon: <Users className="h-4 w-4" />, label: tags.tripType, type: "meta" });
  }
  if (tags.peopleCount) {
    items.push({ icon: <Users className="h-4 w-4" />, label: `${tags.peopleCount}人`, type: "meta" });
  }
  if (tags.transportation) {
    items.push({ icon: <Car className="h-4 w-4" />, label: tags.transportation, type: "meta" });
  }
  if (tags.departure) {
    items.push({ icon: <MapPin className="h-4 w-4" />, label: `出发：${tags.departure}`, type: "meta" });
  }
  if (tags.destination) {
    items.push({ icon: <MapPin className="h-4 w-4" />, label: `目的地：${tags.destination}`, type: "meta" });
  }
  if (tags.days) {
    items.push({ icon: <Clock className="h-4 w-4" />, label: `${tags.days}天`, type: "meta" });
  } else if (tags.dates) {
    items.push({ icon: <Clock className="h-4 w-4" />, label: tags.dates, type: "meta" });
  }

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-2">已识别</p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-vibe-sea/20 px-2.5 py-1 text-xs text-charcoal"
              >
                {item.icon}
                {item.label}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {tags.preferences.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-2">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" />偏好
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.preferences.map((p, i) => (
              <motion.div
                key={p}
                layoutId={`pref-${p}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (items.length + i) * 0.03 }}
                className="inline-flex items-center gap-1 rounded-full bg-vibe-dusk/20 px-2.5 py-1 text-xs text-charcoal"
              >
                {p}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {tags.constraints.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-2">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />注意事项
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.constraints.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (items.length + tags.preferences.length + i) * 0.03 }}
                className="inline-flex items-center gap-1 rounded-full bg-vibe-forest/20 px-2.5 py-1 text-xs text-charcoal"
              >
                {c}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 页面主组件 ──────────────────────────────────────

export default function ConfirmPage() {
  const router = useRouter();
  const {
    transcript,
    refinedTranscript,
    tags,
    _hydrated,
    setTranscript,
    setRefinedTranscript,
    setTags,
    reset,
  } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [draft, setDraft] = useState(refinedTranscript || transcript || "");
  const [departureInput, setDepartureInput] = useState(tags?.departure || "");
  const [reExtractSuccess, setReExtractSuccess] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!_hydrated) return;
    if (!tags) router.replace("/");
  }, [tags, router, _hydrated]);

  useEffect(() => {
    setDraft(refinedTranscript || transcript || "");
  }, [refinedTranscript, transcript]);

  useEffect(() => {
    setDepartureInput(tags?.departure || "");
  }, [tags?.departure]);

  if (!_hydrated) return null;
  if (!tags) return null;

  const updateTags = (next: ExtractedTags) => setTags(next);

  // 快速补全：点击 chip 直接更新 tag
  const fillField = (field: MissingField, value: string) => {
    const updated = { ...tags };
    if (field.key === "days" || field.key === "peopleCount") {
      const num = parseInt(value);
      if (!isNaN(num)) (updated as any)[field.key] = num;
    } else if (field.key === "preferences") {
      const existing = updated.preferences || [];
      if (!existing.includes(value)) {
        updated.preferences = [...existing, value];
      }
    } else {
      (updated as any)[field.key] = value;
    }
    setTags(updated);
  };

  // 🆕 出发地直接输入
  const handleDepartureBlur = () => {
    const val = departureInput.trim();
    if (val) {
      setTags({ ...tags, departure: val });
    }
  };

  // 行程细节补全
  const fillTripDetail = (key: "departureTime" | "returnTime" | "hotelStatus", value: string) => {
    setTags({ ...tags, [key]: value });
  };

  const missingFields = getMissingFields(tags);
  const filledCount = 6 - missingFields.length;

  // 🆕 重新理解（带成功反馈）
  const reExtract = async () => {
    if (!draft.trim()) { setError("文本不能为空"); return; }
    setReExtracting(true);
    setError(null);
    setReExtractSuccess(false);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "重新理解失败");
      setTranscript(data.originalTranscript ?? draft);
      setRefinedTranscript(data.refinedTranscript ?? draft);
      setTags(data.tags);
      setReExtractSuccess(true);
      setTimeout(() => setReExtractSuccess(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新理解失败");
    } finally { setReExtracting(false); }
  };

  const startAppendingRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAppendingAudio(blob);
      };
      mediaRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (e) { setError(getMicErrorMessage(e)); }
  };

  const stopAppendingRecording = () => { mediaRef.current?.stop(); setIsRecording(false); };

  const processAppendingAudio = async (blob: Blob) => {
    setReExtracting(true);
    setReExtractSuccess(false);
    try {
      const fd = new FormData(); fd.append("file", blob);
      const asrRes = await fetch("/api/asr", { method: "POST", body: fd });
      const asrData = await asrRes.json();
      if (!asrRes.ok) throw new Error(asrData.error ?? "转写失败");

      const newText = asrData.text.trim();
      const combinedDraft = draft.trim() ? `${draft.trim()}，${newText}` : newText;
      setDraft(combinedDraft);

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: combinedDraft }),
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? "理解失败");
      setTranscript(combinedDraft);
      setRefinedTranscript(extractData.refinedTranscript ?? combinedDraft);
      setTags(extractData.tags);
      setReExtractSuccess(true);
      setTimeout(() => setReExtractSuccess(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败");
    } finally { setReExtracting(false); }
  };

  const goNext = () => router.push("/discover");

  // 🆕 出发时间默认值映射
  const DEPARTURE_TIME_DEFAULTS: Record<string, string> = {
    "早上出发": "默认 9:00 出发",
    "中午出发": "默认 13:00 出发",
    "下午出发": "默认 15:00 出发",
  };

  const RETURN_TIME_DEFAULTS: Record<string, string> = {
    "午饭后返程": "默认 13:00 返程",
    "一早返程": "默认 9:00 返程",
  };

  return (
    <div className="space-y-5 py-4">
      {/* 标题 */}
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold text-charcoal">我听到了这些</h1>
        <p className="text-sm text-muted">确认一下，也可以继续补充</p>
      </div>

      {/* 需求文本区 */}
      <GlassCard>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted">需求描述</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isRecording ? stopAppendingRecording : startAppendingRecording}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isRecording ? "bg-red-100 text-red-700" : "bg-vibe-dusk/15 text-vibe-dusk hover:bg-vibe-dusk/25"
              }`}
              disabled={reExtracting}
            >
              <Mic className={`h-3.5 w-3.5 ${isRecording ? "animate-pulse" : ""}`} />
              {isRecording ? "录音中…" : "补充语音"}
            </button>
            {transcript && transcript !== refinedTranscript && (
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="text-xs text-muted underline-offset-2 hover:underline"
              >
                {showOriginal ? "收起原文" : "查看原文"}
              </button>
            )}
          </div>
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-2xl border border-white/40 bg-white/70 px-3 py-2 text-sm leading-relaxed text-charcoal outline-none focus:border-vibe-dusk/40"
          placeholder="你可以在这里修改或补充文字"
        />

        {showOriginal && transcript && (
          <p className="mt-2 rounded-2xl bg-white/40 px-3 py-2 text-xs leading-relaxed text-muted">
            {transcript}
          </p>
        )}

        <div className="mt-3 flex justify-end items-center gap-2">
          {/* 🆕 重新理解成功反馈 */}
          {reExtractSuccess && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-vibe-sea font-medium"
            >
              ✅ 已更新
            </motion.span>
          )}
          <Button size="sm" variant="outline" onClick={() => { reset(); router.push("/"); }} disabled={reExtracting}>
            重新说
          </Button>
          <Button
            size="sm"
            onClick={reExtract}
            disabled={reExtracting}
            className="gap-1.5"
          >
            {reExtracting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {reExtracting ? "理解中…" : "重新理解"}
          </Button>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </GlassCard>

      {/* 结构化标签 + 信息完备度 */}
      <LayoutGroup>
        <GlassCard>
          <StructuredTags tags={tags} />
        </GlassCard>

        {missingFields.length > 0 && (
          <GlassCard>
          <div className="space-y-3">
            <p className="text-sm text-charcoal/80">
              {filledCount >= 3
                ? "差不多了，再补一点就能生成更精准的攻略"
                : "信息越多推荐的攻略越准，帮你快速补全"}
            </p>

            {/* 完备度进度条 */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-vibe-sea to-vibe-dusk rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(filledCount / 6) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <span className="text-xs text-muted">{filledCount}/6</span>
            </div>

            {/* 缺失字段 chips */}
            <div className="space-y-3">
              {missingFields.map((field) => (
                <div key={field.key} className="flex items-start gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted mt-1 min-w-[4.5rem]">
                    {field.icon}
                    {field.label}
                  </span>
                  <div className="flex flex-wrap gap-1.5 items-center flex-1">
                    {/* 🆕 出发地：直接显示输入框 */}
                    {field.key === "departure" ? (
                      <div className="flex items-center gap-2 w-full max-w-[200px]">
                        <input
                          type="text"
                          value={departureInput}
                          onChange={(e) => setDepartureInput(e.target.value)}
                          onBlur={handleDepartureBlur}
                          onKeyDown={(e) => { if (e.key === "Enter") handleDepartureBlur(); }}
                          placeholder="输入城市名，如：上海"
                          className="flex-1 rounded-full border border-vibe-dusk/20 bg-white/50 px-3 py-1.5 text-xs text-charcoal outline-none focus:border-vibe-dusk/40 placeholder:text-muted/40"
                        />
                        <span className="text-[10px] text-muted/40 whitespace-nowrap">回车确认</span>
                      </div>
                    ) : field.key === "preferences" ? (
                      field.chips
                        .filter((chip) => !tags.preferences.includes(chip))
                        .map((chip) => (
                          <motion.button
                            key={chip}
                            layoutId={`pref-${chip}`}
                            type="button"
                            onClick={() => fillField(field, chip)}
                            className="inline-flex items-center rounded-full border border-vibe-dusk/20 bg-white/50 px-2.5 py-1 text-xs text-charcoal/70 hover:bg-vibe-dusk/10 hover:border-vibe-dusk/40 transition-colors"
                          >
                            {chip}
                          </motion.button>
                        ))
                    ) : (
                      field.chips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => fillField(field, chip)}
                          className="inline-flex items-center rounded-full border border-vibe-dusk/20 bg-white/50 px-2.5 py-1 text-xs text-charcoal/70 hover:bg-vibe-dusk/10 hover:border-vibe-dusk/40 transition-colors"
                        >
                          {chip}
                        </button>
                      ))
                    )}
                    {field.chips.length === 0 && field.key !== "departure" && (
                      <span className="text-xs text-muted/50 italic">
                        在文本框里补充或重新语音输入
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      )}
      </LayoutGroup>

      {/* ── 🆕 行程细节确认 ── */}
      <GlassCard>
        <div className="space-y-3">
          <p className="text-sm text-charcoal/80">行程细节确认</p>

          {/* 出发时间 — 带默认值标注 */}
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted mt-1 min-w-[5rem]">⏰ 出发时间</span>
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {["早上出发", "中午出发", "下午出发"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => fillTripDetail("departureTime", opt)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      tags.departureTime === opt
                        ? "bg-vibe-sea/20 border-vibe-sea/40 text-charcoal"
                        : "border-vibe-dusk/20 bg-white/50 text-charcoal/70 hover:bg-vibe-dusk/10"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {/* 🆕 默认值说明 */}
              {tags.departureTime && (
                <p className="text-[10px] text-muted/50">
                  📌 {DEPARTURE_TIME_DEFAULTS[tags.departureTime]}
                </p>
              )}
            </div>
          </div>

          {/* 返程偏好 — 带默认值标注 */}
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted mt-1 min-w-[5rem]">🚗 返程偏好</span>
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {["午饭后返程", "一早返程"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => fillTripDetail("returnTime", opt)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      tags.returnTime === opt
                        ? "bg-vibe-dusk/20 border-vibe-dusk/40 text-charcoal"
                        : "border-vibe-dusk/20 bg-white/50 text-charcoal/70 hover:bg-vibe-dusk/10"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {/* 🆕 默认值说明 */}
              {tags.returnTime && (
                <p className="text-[10px] text-muted/50">
                  📌 {RETURN_TIME_DEFAULTS[tags.returnTime]}
                </p>
              )}
            </div>
          </div>

          {/* 酒店 */}
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted mt-1 min-w-[5rem]">🏨 酒店</span>
            <div className="flex flex-wrap gap-1.5">
              {["已定酒店", "需要推荐"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => fillTripDetail("hotelStatus", opt)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    tags.hotelStatus === opt
                      ? "bg-vibe-forest/20 border-vibe-forest/40 text-charcoal"
                      : "border-vibe-dusk/20 bg-white/50 text-charcoal/70 hover:bg-vibe-dusk/10"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 操作按钮 */}
      <div className="flex flex-col gap-2.5">
        <Button variant="outline" size="sm" onClick={() => router.push("/")} disabled={loading}>
          返回重说
        </Button>
        <Button onClick={goNext} disabled={loading}>
          确认并继续
        </Button>
      </div>
    </div>
  );
}
