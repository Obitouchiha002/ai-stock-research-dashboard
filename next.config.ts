import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Keep these out of the server bundle. yahoo-finance2 resolves schema files at
  // runtime and technicalindicators uses dynamic requires; bundling either can
  // break inside a serverless function.
  serverExternalPackages: ["yahoo-finance2", "technicalindicators", "unpdf", "mammoth"],

  poweredByHeader: false,
  // Hide the floating dev indicator badge in the corner.
  devIndicators: false,
};

export default nextConfig;
