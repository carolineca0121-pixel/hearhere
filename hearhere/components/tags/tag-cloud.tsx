"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { ExtractedTags } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TagCloudProps {
  tags: ExtractedTags;
  editable?: boolean;
  onRemovePreference?: (index: number) => void;
  onAddPreference?: (text: string) => void;
}

function TagPill({
  label,
  variant = "default",
  onRemove,
}: {
  label: string;
  variant?: "default" | "constraint" | "conflict";
  onRemove?: () => void;
}) {
  return (
    <motion.span
      layout
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm",
        variant === "constraint" && "bg-vibe-forest/30 text-charcoal",
        variant === "conflict" && "bg-vibe-dusk/40 text-charcoal",
        variant === "default" && "bg-vibe-sea/35 text-charcoal"
      )}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 hover:bg-white/50"
          aria-label="移除标签"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </motion.span>
  );
}

export function TagCloud({
  tags,
  editable,
  onRemovePreference,
}: TagCloudProps) {
  const meta: string[] = [];
  if (tags.destination) meta.push(`目的地：${tags.destination}`);
  if (tags.peopleCount) meta.push(`${tags.peopleCount} 人`);
  if (tags.dates) meta.push(tags.dates);
  if (tags.budget) meta.push(tags.budget);
  if (tags.groupMode) meta.push("团体模式");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">我听到了这些关键点</p>
      {meta.length > 0 && (
        <motion.div className="flex flex-wrap gap-2" layout>
          {meta.map((m) => (
            <TagPill key={m} label={m} variant="default" />
          ))}
        </motion.div>
      )}
      <motion.div className="flex flex-wrap gap-2" layout>
        {tags.preferences.map((p, i) => (
          <TagPill
            key={`p-${i}-${p}`}
            label={p}
            onRemove={
              editable && onRemovePreference
                ? () => onRemovePreference(i)
                : undefined
            }
          />
        ))}
      </motion.div>
      {tags.constraints.length > 0 && (
        <motion.div className="flex flex-wrap gap-2" layout>
          {tags.constraints.map((c, i) => (
            <TagPill key={`c-${i}`} label={c} variant="constraint" />
          ))}
        </motion.div>
      )}
      {tags.conflicts.length > 0 && (
        <motion.div className="flex flex-wrap gap-2" layout>
          {tags.conflicts.map((c, i) => (
            <TagPill key={`x-${i}`} label={c} variant="conflict" />
          ))}
        </motion.div>
      )}
    </div>
  );
}
