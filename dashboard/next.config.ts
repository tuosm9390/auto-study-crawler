import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // .env 파일에서 YOUTUBE_API_KEY를 서버사이드에서 읽을 수 있도록
  env: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  },
};

export default nextConfig;
