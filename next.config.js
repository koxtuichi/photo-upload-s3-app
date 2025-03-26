/** @type {import('next').NextConfig} */
// const withPWA = require('next-pwa');

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // output: "export", // 静的HTMLとJSファイルを出力
  distDir: "out", // 出力先ディレクトリ
  trailingSlash: true, // 末尾のスラッシュを追加（静的ビルドのためのパス解決改善）
  images: {
    domains: ["photo-upload-s3-app.s3.ap-northeast-1.amazonaws.com"],
    unoptimized: true, // 静的エクスポートではimages最適化を無効にする必要あり
    // remotePatterns: [
    //   {
    //     protocol: 'https',
    //     hostname: 'photo-upload-s3-app.s3.ap-northeast-1.amazonaws.com',
    //     pathname: '/**',
    //   },
    // ],
  },
};

// const pwaConfig = withPWA({
//   dest: "public",
//   register: true,
//   skipWaiting: true,
//   disable: process.env.NODE_ENV === "development",
// });

// module.exports = pwaConfig(nextConfig);
module.exports = nextConfig;
