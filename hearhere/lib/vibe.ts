import type { VibeTheme } from "@/lib/types";

export const VIBE_COLORS: Record<VibeTheme, string> = {
  sea: "#A2C2E1",
  forest: "#B4CBB7",
  dusk: "#E9C46A",
};

export function inferVibeTheme(destination: string): VibeTheme {
  const d = destination.toLowerCase();
  if (/海|岛|滨|湖|青岛|三亚|厦门/.test(d)) return "sea";
  if (/山|林|谷|九寨|丽江|张家界/.test(d)) return "forest";
  return "dusk";
}

export function vibeThemeLabel(theme: VibeTheme): string {
  const labels: Record<VibeTheme, string> = {
    sea: "海滨",
    forest: "山林",
    dusk: "黄昏",
  };
  return labels[theme];
}
