"use client";

import { useEffect, useState } from "react";

type EdgeStatus = "online" | "reconnecting" | "offline";

export default function HeaderBadge() {
  const [status, setStatus] = useState<EdgeStatus>("reconnecting");
  const [latency, setLatency] = useState<number | null>(null);
  const [rayId, setRayId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkEdge = async () => {
      const startedAt = performance.now();
      try {
        const [health, ready] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }),
          fetch("/api/ready", { cache: "no-store" }),
        ]);
        if (!health.ok || !ready.ok) {
          throw new Error("Health endpoint unavailable");
        }

        const readyPayload = await ready.json() as { degraded?: boolean };
        if (!cancelled) {
          setLatency(Math.round(performance.now() - startedAt));
          setRayId(health.headers.get("cf-ray"));
          setStatus(readyPayload.degraded ? "reconnecting" : "online");
        }
      } catch {
        if (!cancelled) {
          setStatus("offline");
          setLatency(null);
          setRayId(null);
        }
      }
    };

    void checkEdge();
    const interval = window.setInterval(() => void checkEdge(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const label = status === "online" ? "Online" : status === "reconnecting" ? "Reconnecting" : "Offline";
  const color = status === "online" ? "bg-emerald-500" : status === "reconnecting" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2 text-xs font-mono text-slate-300" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${color} ${status !== "offline" ? "animate-pulse" : ""}`} />
      <span>Edge: {label}</span>
      {latency !== null && <span className="text-slate-500">{latency}ms</span>}
      {rayId && <span className="hidden text-slate-500 lg:inline">CF-Ray {rayId}</span>}
    </div>
  );
}
