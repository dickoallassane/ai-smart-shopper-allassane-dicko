import type { NextConfig } from "next"
import path from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..")

const nextConfig: NextConfig = {
  transpilePackages: ["@shopfriend/shared"],
  outputFileTracingRoot: workspaceRoot
}

export default nextConfig;
