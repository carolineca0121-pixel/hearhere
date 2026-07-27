import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: "#FBF9F7",
        charcoal: "#2D2E30",
        muted: "#8E9196",
        vibe: {
          sea: "#A2C2E1",
          forest: "#B4CBB7",
          dusk: "#E9C46A",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "PingFang SC", "system-ui", "sans-serif"],
        serif: ["var(--font-noto-serif)", "Noto Serif SC", "serif"],
      },
      boxShadow: {
        glass: "0 10px 40px rgba(0,0,0,0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
