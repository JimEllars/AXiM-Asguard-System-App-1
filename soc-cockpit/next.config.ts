import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The repository has a second lockfile at the monorepo root, which makes Next
  // infer the wrong tracing root and pull sibling directories into the bundle.
  // Pin tracing to this package so the OpenNext worker stays self-contained.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default nextConfig;
