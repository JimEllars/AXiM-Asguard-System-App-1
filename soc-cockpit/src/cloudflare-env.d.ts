interface CloudflareEnv {
  ASGUARD?: Fetcher;
  ASGUARD_JWT_SECRET?: string;
  AXIM_SERVICE_TOKEN?: string;
  ASGUARD_BLACKLIST?: KVNamespace;
  ASGUARD_TELEMETRY?: KVNamespace;
}
