import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/admin",
  reactCompiler: true,
  images: { unoptimized: true },
};

export default nextConfig;
