import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // 配置 outputs 目录的静态文件服务
  async rewrites() {
    return [
      {
        source: '/outputs/posters/:path*',
        destination: '/api/outputs/posters/:path*',
      },
      {
        source: '/outputs/poi-sets/:path*',
        destination: '/api/outputs/poi-sets/:path*',
      },
    ]
  },
  // E4.5 Phase 8-2：封闭旧 1.0 产品入口（旧链路可创建非画布模型的 trip）；只封入口，不删旧页面。
  // 用 307（非 permanent）：避免 PWA/浏览器对永久重定向的长期缓存。
  async redirects() {
    return [
      { source: "/explore", destination: "/discover", permanent: false },
      { source: "/foods", destination: "/discover", permanent: false },
      { source: "/builder", destination: "/discover", permanent: false },
      { source: "/discover/feed", destination: "/discover", permanent: false },
      { source: "/discover/interests", destination: "/discover", permanent: false },
      { source: "/discover/map", destination: "/discover", permanent: false },
    ];
  },
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
