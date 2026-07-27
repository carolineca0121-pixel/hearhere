import type { Metadata } from "next";
import { Inter, Noto_Serif_SC } from "next/font/google";
import { Providers } from "@/components/providers";
import { MeshBackground } from "@/components/layout/mesh-background";
import { SiteHeader } from "@/components/layout/site-header";
import { OfflineBanner } from "@/components/layout/offline-banner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const notoSerif = Noto_Serif_SC({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-noto-serif",
});

export const metadata: Metadata = {
  title: "HearHere · 听见",
  description: "在这里听见你的需求",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HearHere",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${inter.variable} ${notoSerif.variable} font-sans antialiased`}
      >
        <Providers>
          <MeshBackground />
          <SiteHeader />
          <OfflineBanner />
          <main className="mx-auto min-h-[calc(100vh-5rem)] max-w-2xl px-6 pb-16 pt-4">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
