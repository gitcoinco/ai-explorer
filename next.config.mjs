/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "d16c97c2np8a2o.cloudfront.net",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
