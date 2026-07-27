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
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
