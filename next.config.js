/** @type {import('next').NextConfig} */
// const withPWA = require('next-pwa');

const nextConfig = {
  /* config options here */
  images: {
    domains: ["photo-upload-s3-app.s3.ap-northeast-1.amazonaws.com"],
    // または以下のようにremotePatternsを使用することもできます
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
