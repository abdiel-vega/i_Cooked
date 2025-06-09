import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.spoonacular.com",
        port: "",
        pathname: "/**", // allows any path under this hostname
      },
    ],
  },
  /* other config options if any */
};

export default nextConfig;
