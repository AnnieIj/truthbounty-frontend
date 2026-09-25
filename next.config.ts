import type { NextConfig } from "next";
import { buildStaticSecurityHeaders } from "./src/lib/security/headers";

const staticSecurityHeaders = Object.entries(buildStaticSecurityHeaders()).map(
  ([key, value]) => ({ key, value }),
);

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: ['wagmi', '@wagmi/core', '@wagmi/connectors', 'viem'],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: staticSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
