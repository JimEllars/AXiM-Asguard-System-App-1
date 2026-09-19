import React from 'react';
import LiveThreatFeed from '@/components/LiveThreatFeed';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

const HomeFallback = () => (
  <div className="border border-slate-800/50 bg-slate-950/20 rounded font-mono p-6 text-center text-xs text-slate-500 max-w-lg w-full flex flex-col items-center gap-2 m-auto mt-20">
     <div className="uppercase tracking-wider text-red-500">Telemetry Disconnected</div>
     <div>Could not render active threat grid. Reconnecting...</div>
  </div>
);

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

      <ErrorBoundary FallbackComponent={HomeFallback}>
        <Suspense fallback={<div className="border border-slate-800/50 bg-slate-950/20 rounded font-mono p-6 text-center text-xs text-slate-500">Loading Telemetry...</div>}>
          <LiveThreatFeed />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
