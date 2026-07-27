"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { BreathButton } from "@/components/voice/breath-button";
import { GlassCard } from "@/components/layout/glass-card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session";
import Link from "next/link";
import {
  Sparkles,
  Calendar,
  Search,
  Shuffle,
  ImagePlus,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  INTEREST_PRESETS,
  POPULAR_DESTINATIONS,
  pickDestination,
  pickSamples,
  pickSurprise,
} from "@/lib/interests";

const EXAMPLES = [
  "我和女朋友想下个月去厦门三天，我爱看海，她想吃海鲜，预算两千五",
  "三个女生五一去成都，不想太累，想找小众咖啡馆和拍照点",
  "带父母去杭州玩两天，老人不能多走路，想安静看西湖",
];

const FLOW_STEPS = [
  { emoji: "🎤", label: "说出需求" },
  { emoji: "🏷️", label: "确认标签" },
  { emoji: "📍", label: "选择地点" },
  { emoji: "✨", label: "生成攻略" },
];

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { reset, setTranscript, setRefinedTranscript, setTags } = useSessionStore();
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [activeQuickDest, setActiveQuickDest] = useState<string | null>(null);
  // 截图创建行程
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // 每个兴趣卡片的示例目的地（页面加载时随机选好，不闪烁）
  const interestSamples = useMemo(
    () => INTEREST_PRESETS.map((p) => pickSamples(p, 3)),
    []
  );

  // 每个兴趣卡片的首选目的地（点击时使用）
  const interestDestinations = useMemo(
    () => INTEREST_PRESETS.map((p) => pickDestination(p)),
    []
  );

  useEffect(() => {
    const t = setInterval(() => {
      setExampleIndex((i) => (i + 1) % EXAMPLES.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // ── 语音录制逻辑 ──────────────────────────

  const startRecording = async () => {
    setError(null);
    reset();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(blob);
      };
      mediaRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError("无法访问麦克风，请检查浏览器权限");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setIsRecording(false);
  };

  const processAudio = async (blob: Blob) => {
    if (!session?.user) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", blob);
      const asrRes = await fetch("/api/asr", { method: "POST", body: fd });
      const asrData = await asrRes.json();
      if (!asrRes.ok) throw new Error(asrData.error ?? "转写失败");

      setTranscript(asrData.text);

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: asrData.text }),
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? "理解失败");

      setRefinedTranscript(extractData.refinedTranscript ?? asrData.text);
      setTags(extractData.tags);
      router.push("/confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败");
    } finally {
      setLoading(false);
    }
  };

  // ── 截图创建行程 ──────────────────────────────────

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processImage = async () => {
    if (!imageFile) return;
    if (!session?.user) {
      router.push("/login");
      return;
    }
    setImageLoading(true);
    setError(null);
    reset();
    try {
      const fd = new FormData();
      fd.append("file", imageFile);
      const res = await fetch("/api/extract-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "图片识别失败");

      setTranscript("");
      setRefinedTranscript("");
      setTags(data.tags);
      router.push("/confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片识别失败，请换一张试试");
    } finally {
      setImageLoading(false);
    }
  };

  // ── 热门目的地点击（有明确目标的用户） ──

  const handleQuickDest = (dest: string) => {
    setActiveQuickDest(dest);
    setTags({
      destination: dest,
      preferences: [],
      constraints: [],
      conflicts: [],
    });
    // 短暂高亮后跳转
    setTimeout(() => router.push("/discover"), 200);
  };

  // ── 兴趣卡片点击 ──────────────────────────────────

  const handleInterestClick = (interestIndex: number) => {
    const preset = INTEREST_PRESETS[interestIndex];
    const destination = preset.id === "surprise"
      ? pickSurprise().sampleDestinations[0]
      : interestDestinations[interestIndex];

    const tags = preset.id === "surprise"
      ? { ...pickSurprise().tags, destination }
      : { ...preset.tags, destination };

    setTags({
      ...tags,
      departure: undefined,
      tripType: undefined,
      peopleCount: undefined,
      days: undefined,
      transportation: undefined,
    });

    router.push("/discover");
  };

  if (status === "loading") {
    return <p className="text-center text-muted py-20">加载中…</p>;
  }

  const isLoggedIn = !!session?.user;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] px-4 gap-6 pb-8">
      {/* ==================== 标题区 ==================== */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center space-y-3"
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-vibe-sea to-vibe-dusk flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-medium tracking-wide text-charcoal">
          说出你的旅行需求
        </h1>
        <p className="text-sm text-muted max-w-xs mx-auto leading-relaxed">
          琐碎、混乱也没关系，我会听懂并帮你规划
        </p>
      </motion.div>

      {/* ==================== 未登录 ==================== */}
      {!isLoggedIn ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm"
        >
          <GlassCard className="text-center py-6 px-8">
            <p className="mb-5 text-sm text-muted">
              登录后即可开始语音规划你的专属旅程
            </p>
            <div className="flex gap-3 justify-center">
              <Button asChild variant="outline" size="sm">
                <Link href="/register">注册</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/login">登录</Link>
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="flex flex-col items-center gap-4 w-full max-w-md"
        >
          {/* ========== 呼吸按钮 ========== */}
          <BreathButton
            isRecording={isRecording}
            disabled={loading}
            onStart={startRecording}
            onStop={stopRecording}
          />

          {/* ========== 例句轮播 ========== */}
          <div className="flex flex-col items-center gap-2.5 w-full">
            <span className="text-[11px] tracking-wider uppercase text-muted/60">
              试着说
            </span>
            <div className="relative w-full min-h-[2.5rem] flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={exampleIndex}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.35 }}
                  className="text-center text-sm leading-relaxed text-charcoal/60 italic"
                >
                  &ldquo;{EXAMPLES[exampleIndex]}&rdquo;
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="flex gap-1.5">
              {EXAMPLES.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    i === exampleIndex
                      ? "w-3 bg-vibe-dusk/60"
                      : "w-1 bg-vibe-dusk/15"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* ========== 加载 ========== */}
          {loading && (
            <GlassCard className="w-full text-center py-4">
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-vibe-dusk/30 border-t-vibe-dusk" />
                <span className="text-sm text-muted">正在倾听与理解…</span>
              </div>
            </GlassCard>
          )}

          {/* ========== 错误 ========== */}
          {error && (
            <GlassCard className="w-full border-amber-200/50 bg-amber-50/60">
              <p className="text-sm text-amber-900">{error}</p>
              {error.includes("麦克风") && (
                <p className="mt-1.5 text-xs text-muted">
                  浏览器地址栏左侧的小锁图标 → 网站设置 → 允许麦克风。
                </p>
              )}
            </GlassCard>
          )}

          {/* ========== 📷 截图创建行程 ========== */}
          <div className="w-full">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImagePick}
            />
            {!imagePreview ? (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 rounded-2xl bg-white/60 backdrop-blur-sm border border-dashed border-vibe-dusk/25 px-4 py-3 hover:bg-white/80 hover:border-vibe-dusk/40 transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-vibe-sea/15 to-vibe-dusk/15 flex items-center justify-center shrink-0">
                  <ImagePlus className="w-4.5 h-4.5 text-vibe-dusk" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-charcoal/90">
                    📷 从截图创建行程
                  </p>
                  <p className="text-xs text-muted/70">
                    刷到小红书攻略？截图丢给我，自动识别
                  </p>
                </div>
              </motion.button>
            ) : (
              <GlassCard className="w-full">
                <div className="flex items-start gap-3">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-white/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="截图预览"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal/90 truncate">
                      {imageFile?.name ?? "已选择截图"}
                    </p>
                    <p className="text-xs text-muted/60 mt-0.5">
                      识别图片中的目的地、天数、偏好
                    </p>
                    <div className="flex gap-2 mt-2.5">
                      <Button
                        size="sm"
                        onClick={processImage}
                        disabled={imageLoading}
                        className="h-8 text-xs"
                      >
                        {imageLoading ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            识别中…
                          </span>
                        ) : (
                          "开始识别"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearImage}
                        disabled={imageLoading}
                        className="h-8 text-xs text-muted"
                      >
                        <X className="w-3 h-3 mr-0.5" />
                        换一张
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        </motion.div>
      )}

      {/* ==================== 🅰️ 热门目的地（有明确目标的用户）==================== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="w-full max-w-md space-y-2.5"
      >
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-muted/50" />
          <span className="text-xs text-muted/60">热门目的地，点一个直接开始</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_DESTINATIONS.map((dest) => (
            <motion.button
              key={dest}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleQuickDest(dest)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                activeQuickDest === dest
                  ? "bg-vibe-sea text-white shadow-sm"
                  : "bg-white/60 hover:bg-white/90 text-charcoal/70 border border-white/50 hover:border-vibe-dusk/20"
              }`}
            >
              <MapPinIcon />
              {dest}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ==================== 🅱️ 兴趣发现网格（帮我选选型用户）==================== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="w-full max-w-md space-y-3"
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-vibe-dusk/10" />
          <span className="text-xs text-muted/50 whitespace-nowrap">
            或者，告诉我你喜欢什么
          </span>
          <div className="flex-1 h-px bg-vibe-dusk/10" />
        </div>

        {/* 3x2 网格 — 每个卡片显示3个示例目的地 */}
        <div className="grid grid-cols-3 gap-2.5">
          {INTEREST_PRESETS.map((interest, i) => {
            const samples = interestSamples[i];
            return (
              <motion.button
                key={interest.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 + i * 0.06, duration: 0.4 }}
                onClick={() => handleInterestClick(i)}
                className={`
                  group relative flex flex-col items-center gap-1 p-3 rounded-2xl
                  bg-white/60 backdrop-blur-sm border border-white/40
                  hover:bg-white/80 hover:border-vibe-dusk/20
                  active:scale-[0.97] transition-all duration-200
                  cursor-pointer
                  ${interest.id === "surprise"
                    ? "bg-gradient-to-br from-vibe-sea/5 to-vibe-dusk/5 border-vibe-dusk/15"
                    : ""
                  }
                `}
              >
                <span className="text-2xl transition-transform duration-200 group-hover:scale-110">
                  {interest.emoji}
                </span>
                <span className="text-xs font-medium text-charcoal/80 leading-tight">
                  {interest.label}
                </span>
                {/* 🆕 显示示例目的地 */}
                <span className="text-[9px] text-muted/40 leading-tight text-center line-clamp-2">
                  {samples.join(" · ")}
                </span>
                {interest.id === "surprise" && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-vibe-dusk/20 flex items-center justify-center">
                    <Shuffle className="w-2.5 h-2.5 text-vibe-dusk" />
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ==================== 底部：轻量流程 + 入口 ==================== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="w-full max-w-md flex flex-col items-center gap-4"
      >
        <div className="flex items-center justify-center gap-1.5 text-xs text-charcoal/70 bg-white/40 backdrop-blur-sm rounded-full px-4 py-1.5 shadow-sm whitespace-nowrap">
          {FLOW_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-0.5">
              <span>{step.emoji}</span>
              <span>{step.label}</span>
              {i < FLOW_STEPS.length - 1 && (
                <span className="text-muted/30 mx-0.5">→</span>
              )}
            </div>
          ))}
        </div>

        {isLoggedIn && (
          <Button asChild variant="ghost" size="sm" className="text-muted">
            <Link href="/trips">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              查看我的攻略
            </Link>
          </Button>
        )}
      </motion.div>
    </div>
  );
}

// 迷你地图定位针图标
function MapPinIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
