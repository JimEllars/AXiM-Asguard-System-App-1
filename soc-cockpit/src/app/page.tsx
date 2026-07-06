import React from 'react';
import LiveThreatFeed from '@/components/LiveThreatFeed';
import { Suspense } from 'react';

export default function Home() {
  return (
    <div className="h-full p-6 flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold">Global Threat Grid</h2>
          <p className="text-slate-400 text-sm mt-1">Monitoring active perimeter defense systems.</p>
        </div>
        <div className="text-xs bg-emerald-950/50 border border-emerald-900 px-3 py-1.5 rounded-md text-emerald-400 font-mono">
          STATUS: TELEMETRY ACTIVE
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <LiveThreatFeed />
      </Suspense>
    </div>
  );
}
