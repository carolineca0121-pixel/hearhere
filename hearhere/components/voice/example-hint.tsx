"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EXAMPLES = [
  "我和女朋友想下个月去厦门三天，我爱看海，她想吃海鲜，预算两千五",
  "三个女生五一去成都，不想太累，想找小众咖啡馆和拍照点",
  "带父母去杭州玩两天，老人不能多走路，想安静看西湖",
];

const ROTATE_MS = 4000;

export function ExampleHint() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % EXAMPLES.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative min-h-[3.2rem] w-full max-w-md px-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center text-sm leading-relaxed text-muted"
          >
            <span className="mr-1.5 text-charcoal/40">💡 试着说：</span>
            <span className="text-charcoal/75">“{EXAMPLES[index]}”</span>
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {EXAMPLES.map((_, i) => (
          <span
            key={i}
            className={
              "h-1 w-1 rounded-full transition-all duration-500 " +
              (i === index ? "w-4 bg-charcoal/50" : "bg-charcoal/15")
            }
          />
        ))}
      </div>
    </div>
  );
}
