import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // 全栈模式 - 支持 API 路由和服务器端渲染
  distDir: 'dist',
  turbopack: {
    root: rootDir,
  },
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // 隐藏 HTTP 请求日志
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
